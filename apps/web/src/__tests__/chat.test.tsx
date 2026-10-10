import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UIMessage, UIMessageChunk } from "ai";
import { Chat } from "@ai-sdk/react";
import ChatMessage, { preprocessCitations } from "../components/ChatMessage";
import ChatView from "../components/ChatView";
import {
  getProgressStage, getMessageText, getMessagePassages, getMessageFollowups,
  loadThreadMessages, type ChatPassage,
} from "../hooks/use-chat-session";

const passage: ChatPassage = {
  chunkId: "article-c-12", itemId: "article", title: "Article", url: "https://example.com",
  quote: "A passage", rerankScore: 0.9,
};
afterEach(() => vi.unstubAllGlobals());

describe("chat messages", () => {
  it("preserves chunk labels, item cross references and source fallback", () => {
    expect(preprocessCitations("[c:article-c-12] [c:abcdefghi] [i:article] [i:other]", [passage]))
      .toBe("[c12](#cite-c-article-c-12) [abcdef](#cite-c-abcdefghi) [c12](#cite-i-article) [src](#cite-i-other)");
  });

  it("renders citation badges and safe external links", () => {
    const message: UIMessage = { id: "answer", role: "assistant", parts: [
      { type: "text", text: "Answer [c:article-c-12] and [link](https://example.com)." },
    ] };
    const html = renderToStaticMarkup(<ChatMessage message={message} isStreaming={false} onPick={() => {}} />);
    expect(html).toContain('href="#cite-c-article-c-12"');
    expect(html).toContain('title="Jump to source"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("streaming-cursor");
  });

  it("uses the latest structured parts and joins text without transient status", () => {
    const message: UIMessage = { id: "answer", role: "assistant", parts: [
      { type: "text", text: "One " },
      { type: "data-passages", data: { passages: [] } },
      { type: "data-status", data: { stage: "writing" } },
      { type: "data-passages", data: { passages: [passage] } },
      { type: "text", text: "two" },
      { type: "data-followups", data: { questions: ["Next?"] } },
    ] };
    expect(getMessageText(message)).toBe("One two");
    expect(getMessagePassages(message)).toEqual([passage]);
    expect(getMessageFollowups(message)).toEqual(["Next?"]);
  });

  it("starts with accessible history loading and send disabled", () => {
    const html = renderToStaticMarkup(<ChatView />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading conversation…");
    expect(html).toMatch(/<input[^>]*disabled=""/);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
    expect(html).not.toContain("What did I save about React?");
  });
});

describe("history hydration", () => {
  it("returns new-thread 404 as empty but surfaces server and network failures", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadThreadMessages("new")).resolves.toEqual([]);
    await expect(loadThreadMessages("failed")).rejects.toThrow("500");
    await expect(loadThreadMessages("failed")).rejects.toThrow("offline");
  });

  it("loads saved messages and encodes the id", async () => {
    const messages: UIMessage[] = [{ id: "q", role: "user", parts: [{ type: "text", text: "Question" }] }];
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ messages }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadThreadMessages("a/b")).resolves.toEqual(messages);
    expect(fetchMock).toHaveBeenCalledWith("/api/threads/a%2Fb", expect.objectContaining({ credentials: "include" }));
  });

  it("passes cancellation to fetch so switching can abort prior history", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn((_url, { signal }: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    })));
    const pending = loadThreadMessages("old", controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

it("keeps completed message identities stable and transient progress out of history", async () => {
  const saved: UIMessage = { id: "saved", role: "assistant", parts: [{ type: "text", text: "Prior answer" }] };
  const stages: string[] = [];
  const chat = new Chat({
    id: "test", messages: [saved],
    transport: {
      async sendMessages() {
        const chunks: UIMessageChunk[] = [
          { type: "start", messageId: "reply" },
          { type: "data-status", data: { stage: "searching" }, transient: true },
          { type: "data-status", data: { stage: "ranking" }, transient: true },
          { type: "data-status", data: { stage: "writing" }, transient: true },
          { type: "text-start", id: "text" },
          { type: "text-delta", id: "text", delta: "New " },
          { type: "text-delta", id: "text", delta: "answer" },
          { type: "text-end", id: "text" },
          { type: "finish" },
        ];
        return new ReadableStream({ start(controller) {
          chunks.forEach((chunk) => controller.enqueue(chunk));
          controller.close();
        } });
      },
      async reconnectToStream() { return null; },
    },
    onData(part) {
      const stage = getProgressStage(part);
      if (stage) stages.push(stage);
    },
  });
  const rows: UIMessage[][] = [];
  chat["~registerMessagesCallback"](() => rows.push(chat.messages));
  await chat.sendMessage({ text: "Question" });
  expect(stages).toEqual(["searching", "ranking", "writing"]);
  expect(chat.status).toBe("ready");
  expect(getMessageText(chat.messages.at(-1)!)).toBe("New answer");
  expect(chat.messages.at(-1)!.parts.every((part) => part.type !== "data-status")).toBe(true);
  expect(rows.length).toBeGreaterThan(2);
  expect(rows.every((messages) => messages[0] === saved)).toBe(true);
});

it("accepts only recognized transient progress stages", () => {
  for (const stage of ["searching", "ranking", "writing"]) {
    expect(getProgressStage({ type: "data-status", data: { stage } })).toBe(stage);
  }
  expect(getProgressStage({ type: "data-status", data: { stage: "unknown" } })).toBeNull();
  expect(getProgressStage({ type: "data-status", data: null })).toBeNull();
  expect(getProgressStage({ type: "data-passages", data: { stage: "writing" } })).toBeNull();
});
