import { afterEach, describe, expect, it, vi } from "vitest";
import { Chat } from "@ai-sdk/react";
import { QueryClient } from "@tanstack/react-query";
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import { createChatSession, getChatSession, type ChatSessions } from "../lib/chat-sessions";

type Session = ReturnType<typeof createChatSession>;
const clients: QueryClient[] = [];
function client() {
  const result = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(result);
  return result;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function history(id: string): UIMessage[] {
  return [{ id, role: "assistant", parts: [{ type: "text", text: `Saved ${id}` }] }];
}
function response(messages: UIMessage[]) {
  return new Response(JSON.stringify({ messages }));
}
function until(session: Session, predicate: () => boolean) {
  if (predicate()) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const check = () => {
      if (!predicate()) return;
      cleanups.forEach((cleanup) => cleanup());
      resolve();
    };
    const cleanups = [
      session.subscribe(check),
      session.chat["~registerMessagesCallback"](check),
      session.chat["~registerStatusCallback"](check),
    ];
    check();
  });
}
function streamTransport() {
  let controller!: ReadableStreamDefaultController<UIMessageChunk>;
  const stream = new ReadableStream<UIMessageChunk>({ start(value) { controller = value; } });
  const transport = {
    sendMessages: vi.fn<ChatTransport<UIMessage>["sendMessages"]>(async ({ abortSignal }) => {
      abortSignal?.addEventListener("abort", () => {
        controller.error(new DOMException("Aborted", "AbortError"));
      }, { once: true });
      return stream;
    }),
    reconnectToStream: vi.fn<ChatTransport<UIMessage>["reconnectToStream"]>().mockResolvedValue(null),
  } satisfies ChatTransport<UIMessage>;
  return {
    transport,
    push(...chunks: UIMessageChunk[]) { chunks.forEach((chunk) => controller.enqueue(chunk)); },
    finish() {
      controller.enqueue({ type: "text-end", id: "text" });
      controller.enqueue({ type: "finish", finishReason: "stop" });
      controller.close();
    },
  };
}
function startReply(stream: ReturnType<typeof streamTransport>, id: string, text: string) {
  stream.push(
    { type: "start", messageId: id },
    { type: "text-start", id: "text" },
    { type: "text-delta", id: "text", delta: text },
  );
}
function text(session: Session) {
  return session.chat.messages.flatMap((message) => message.parts)
    .filter((part) => part.type === "text").map((part) => part.text).join("|");
}

afterEach(() => {
  clients.splice(0).forEach((queryClient) => queryClient.clear());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("retained chat sessions", () => {
  it("hydrates once from QueryClient and retains the same SDK chat beyond stale time and cache removal", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const queryClient = client();
    const sessions: ChatSessions = new Map();
    const saved = history("a");
    queryClient.setQueryData(["thread-messages", "a"], saved);
    const session = getChatSession(sessions, "a", queryClient);
    const chat = session.chat;
    expect(chat).toBeInstanceOf(Chat);
    await session.load();
    expect(chat.messages).toEqual(saved);

    // A stale query must not rehydrate (and overwrite) this live conversation.
    chat.messages = [...saved, { id: "local", role: "user", parts: [{ type: "text", text: "Local turn" }] }];
    const retained = chat.messages;
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 60_001);
    getChatSession(sessions, "b", queryClient, true);
    expect(getChatSession(sessions, "a", queryClient)).toBe(session);
    await session.load();
    queryClient.removeQueries({ queryKey: ["thread-messages", "a"] });
    await getChatSession(sessions, "a", queryClient).load();
    expect(session.chat).toBe(chat);
    expect(chat.messages).toBe(retained);
    expect(chat.status).toBe("ready");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("deduplicates hydration, gates sends, and completes switched-away history into its original instance", async () => {
    const pending = deferred<Response>();
    const fetch = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal("fetch", fetch);
    const queryClient = client();
    const sessions: ChatSessions = new Map();
    const stream = streamTransport();
    const a = createChatSession("a", queryClient, { transport: stream.transport });
    sessions.set("a", a);
    await a.sendText("Too early");
    const loading = a.load();
    expect(a.load()).toBe(loading);
    await a.sendText("Still too early");
    a.stop(); // The switch flow stops streaming, not history hydration.
    const b = getChatSession(sessions, "b", queryClient, true);
    b.chat.messages = history("b");
    await b.load();
    pending.resolve(response(history("a")));
    await loading;
    expect(getChatSession(sessions, "a", queryClient)).toBe(a);
    expect(a.chat.messages).toEqual(history("a"));
    expect(a.getSnapshot()).toEqual({ hydrated: true, historyError: null, progress: null });
    expect(b.chat.messages).toEqual(history("b"));
    expect(stream.transport.sendMessages).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith("/api/threads/a", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("surfaces failed history, blocks sends, and retries hydration on the same chat", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(response(history("retry")));
    vi.stubGlobal("fetch", fetch);
    const queryClient = client();
    const sessions: ChatSessions = new Map();
    const stream = streamTransport();
    const session = createChatSession("retry", queryClient, { transport: stream.transport });
    sessions.set("retry", session);
    const chat = session.chat;
    await session.load();
    expect(session.getSnapshot().historyError).toBe("Could not load conversation (503).");
    await session.sendText("Do not send after failure");
    expect(stream.transport.sendMessages).not.toHaveBeenCalled();
    await getChatSession(sessions, "retry", queryClient).load();
    expect(session.chat).toBe(chat);
    expect(chat.messages).toEqual(history("retry"));
    expect(session.getSnapshot()).toEqual({ hydrated: true, historyError: null, progress: null });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("isolates late progress and finish callbacks while another thread streams, and rejects duplicate sends", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const queryClient = client();
    const sessions: ChatSessions = new Map();
    const aStream = streamTransport();
    const bStream = streamTransport();
    const a = createChatSession("a", queryClient, { newThread: true, transport: aStream.transport });
    const b = createChatSession("b", queryClient, { newThread: true, transport: bStream.transport });
    sessions.set("a", a);
    sessions.set("b", b);
    await Promise.all([a.load(), b.load(), a.sendText("   ")]);
    const aSend = a.sendText("  Ask A  ", "openai:gpt-4.1");
    await a.sendText("Duplicate A");
    expect(aStream.transport.sendMessages).toHaveBeenCalledOnce();
    expect(aStream.transport.sendMessages.mock.calls[0][0].body).toEqual({ model: "openai:gpt-4.1" });
    expect(a.chat.messages).toHaveLength(1);
    expect(text(a)).toBe("Ask A");
    expect(a.chat.status).toBe("submitted");
    expect(getChatSession(sessions, "b", queryClient)).toBe(b);
    const bSend = b.sendText("Ask B");
    expect(bStream.transport.sendMessages.mock.calls[0][0].body).toEqual({});
    startReply(bStream, "reply-b", "Answer B");
    bStream.push({ type: "data-status", data: { stage: "searching" }, transient: true });
    await until(b, () => b.getSnapshot().progress === "searching" && text(b).includes("Answer B"));
    const bMessages = b.chat.messages;
    const bSnapshot = b.getSnapshot();

    // A finishes after selection changed to B. Its callbacks must stay bound to A.
    startReply(aStream, "reply-a", "Late answer A");
    aStream.push({ type: "data-status", data: { stage: "writing" }, transient: true });
    await until(a, () => a.getSnapshot().progress === "writing");
    expect(b.getSnapshot()).toBe(bSnapshot);
    aStream.finish();
    await aSend;
    expect(a.chat.status).toBe("ready");
    expect(a.getSnapshot().progress).toBeNull();
    expect(queryClient.getQueryData(["thread-messages", "a"])).toEqual(a.chat.messages);
    expect(queryClient.getQueryData(["thread-messages", "b"])).toBeUndefined();
    expect(b.chat.messages).toBe(bMessages);
    expect(b.chat.status).toBe("streaming");
    expect(b.getSnapshot()).toBe(bSnapshot);
    bStream.finish();
    await bSend;
    expect(queryClient.getQueryData(["thread-messages", "b"])).toEqual(b.chat.messages);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("cancels an immediate send then switch before streaming starts", async () => {
    const stream = streamTransport();
    const session = createChatSession("immediate", client(), { newThread: true, transport: stream.transport });
    const send = session.sendText("Hello");
    session.stop();
    // Wait for SDK submission, not a timer: the old text overload yielded before this state.
    await until(session, () => session.chat.status === "submitted");
    try {
      expect(stream.transport.sendMessages).toHaveBeenCalledOnce();
      expect(stream.transport.sendMessages.mock.calls[0][0].abortSignal?.aborted).toBe(true);
    } finally {
      session.stop();
      await send;
    }
    expect(session.chat.status).toBe("ready");
    expect(session.getSnapshot().progress).toBeNull();
  });

  it("preserves partial messages through stop and revisit without rehydrating or caching an aborted finish", async () => {
    const fetch = vi.fn().mockResolvedValue(response(history("a")));
    vi.stubGlobal("fetch", fetch);
    const queryClient = client();
    const sessions: ChatSessions = new Map();
    const stream = streamTransport();
    const a = createChatSession("a", queryClient, { transport: stream.transport });
    sessions.set("a", a);
    await a.load();
    const send = a.sendText("Continue");
    startReply(stream, "partial", "Partial answer");
    stream.push({ type: "data-status", data: { stage: "writing" }, transient: true });
    await until(a, () => a.getSnapshot().progress === "writing" && text(a).includes("Partial answer"));
    expect(a.chat.status).toBe("streaming");
    const messages = a.chat.messages;
    expect(getChatSession(sessions, "a", queryClient).chat.status).toBe("streaming");
    a.stop();
    expect(a.getSnapshot().progress).toBeNull();
    getChatSession(sessions, "b", queryClient, true);
    await send;
    expect(stream.transport.sendMessages.mock.calls[0][0].abortSignal?.aborted).toBe(true);
    expect(queryClient.getQueryData(["thread-messages", "a"])).toEqual(history("a"));
    queryClient.removeQueries({ queryKey: ["thread-messages", "a"] });
    const revisited = getChatSession(sessions, "a", queryClient);
    await revisited.load();
    expect(revisited).toBe(a);
    expect(revisited.chat.messages).toBe(messages);
    expect(revisited.chat.status).toBe("ready");
    expect(revisited.getSnapshot().progress).toBeNull();
    expect(fetch).toHaveBeenCalledOnce();
  });
});
