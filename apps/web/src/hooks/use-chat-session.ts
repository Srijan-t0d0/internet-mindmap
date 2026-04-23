"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import type { SourceUrlUIPart } from "ai";

// ── Custom data parts emitted by the chat route. Their shape matches the
//    server's `writer.write({ type: "data-X", data: ... })` calls. ──────────
export type ChatPassage = {
  chunkId: string;
  itemId: string;
  url: string;
  title: string;
  quote: string;
  rerankScore: number;
};

export type ChatRetrievalSummary = {
  denseCandidates: number;
  ftsCandidates: number;
  rerankCandidates: number;
  rerankKept: number;
  finalItemCount: number;
  condensed: string | null;
};

type DataPart =
  | { type: "data-passages"; data: { passages: ChatPassage[] } }
  | { type: "data-retrieval"; data: ChatRetrievalSummary }
  | { type: "data-followups"; data: { questions: string[] } }
  | { type: "data-title"; data: { title: string } };

function isDataPart(p: { type: string }): p is DataPart {
  return p.type.startsWith("data-");
}

// All /api/* calls go through the Next.js route handler proxy (same-origin).
const API_BASE = "";
const THREAD_ID_KEY = "im.currentThreadId";

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  const token = process.env.NEXT_PUBLIC_API_TOKEN;
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

// Hoisted to module scope — avoids re-creating on every render which could
// reset useChat internal state or trigger re-subscriptions.
const chatTransport = new DefaultChatTransport({
  api: `${API_BASE}/api/chat`,
  headers: getHeaders,
});

// Generate a client-side thread id. We use crypto.randomUUID() when
// available and fall back to a timestamp + random suffix. The server
// accepts any stable string — it's just a row key.
function newThreadId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// Load a thread's saved messages in AI SDK UIMessage shape. Returns an
// empty array on any failure (404 for a brand-new id is expected).
async function loadThreadMessages(threadId: string): Promise<UIMessage[]> {
  const res = await fetch(`${API_BASE}/api/threads/${threadId}`, {
    credentials: "include",
    headers: getHeaders(),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { messages?: UIMessage[] };
  return data.messages ?? [];
}

/**
 * Shared chat session logic used by ChatView.
 *
 * Persistence:
 * - A thread id is tracked in localStorage so refreshes resume the same
 *   conversation. `useChat({ id })` propagates it to the server via
 *   DefaultChatTransport's default body `{ messages, id }`.
 * - On mount we fetch prior messages for that id and hand them to
 *   `useChat({ messages: initial })`.
 * - The server writes on `onFinish` inside `createUIMessageStream`.
 * - "New chat" mints a fresh thread id and clears the message list.
 */
export function useChatSession() {
  const [input, setInput] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolve (or mint) the thread id once on mount, then hydrate history.
  // We only render the <ChatView /> body after this resolves so
  // `useChat({ id })` doesn't mount with a stale id and then swap.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored =
        typeof window !== "undefined"
          ? window.localStorage.getItem(THREAD_ID_KEY)
          : null;
      const id = stored ?? newThreadId();
      if (!stored && typeof window !== "undefined") {
        window.localStorage.setItem(THREAD_ID_KEY, id);
      }
      const history = stored ? await loadThreadMessages(id) : [];
      if (cancelled) return;
      setThreadId(id);
      setInitialMessages(history);
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Key useChat on the thread id so switching threads fully remounts the
  // underlying message store (AI SDK keys its internal state on `id`).
  const { messages, sendMessage, status, error, clearError, stop, setMessages } = useChat({
    id: threadId ?? undefined,
    messages: initialMessages,
    transport: chatTransport,
    onError: (err) => console.error("[chat]", err),
  });

  const isStreaming = status === "streaming" || status === "submitted";

  // When the assistant turn finishes, broadcast so other parts of the UI
  // (sidebar thread list, etc.) can refresh. We fire on ready transitions
  // because that's when data-title and updated_at land server-side.
  const prevStatusRef = useRef(status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    if (prev !== "ready" && status === "ready" && messages.length > 0) {
      window.dispatchEvent(new CustomEvent("chat:threads-changed"));
    }
    prevStatusRef.current = status;
  }, [status, messages.length]);

  const getMessageText = useCallback(
    (msg: (typeof messages)[number]): string =>
      msg.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join(""),
    []
  );

  const getMessageSources = useCallback(
    (msg: (typeof messages)[number]): SourceUrlUIPart[] =>
      msg.parts.filter((p): p is SourceUrlUIPart => p.type === "source-url"),
    []
  );

  // Find the latest data-* part of a given type. Helpful for pieces the
  // server emits exactly once per assistant turn (passages, retrieval,
  // followups, title).
  function findDataPart<T extends DataPart["type"]>(
    msg: (typeof messages)[number],
    type: T
  ): Extract<DataPart, { type: T }> | undefined {
    for (let i = msg.parts.length - 1; i >= 0; i--) {
      const p = msg.parts[i] as { type: string };
      if (isDataPart(p) && p.type === type) {
        return p as Extract<DataPart, { type: T }>;
      }
    }
    return undefined;
  }

  const getMessagePassages = useCallback(
    (msg: (typeof messages)[number]): ChatPassage[] =>
      findDataPart(msg, "data-passages")?.data.passages ?? [],
    []
  );

  const getMessageRetrieval = useCallback(
    (msg: (typeof messages)[number]): ChatRetrievalSummary | null =>
      findDataPart(msg, "data-retrieval")?.data ?? null,
    []
  );

  const getMessageFollowups = useCallback(
    (msg: (typeof messages)[number]): string[] =>
      findDataPart(msg, "data-followups")?.data.questions ?? [],
    []
  );

  const getMessageTitle = useCallback(
    (msg: (typeof messages)[number]): string | null =>
      findDataPart(msg, "data-title")?.data.title ?? null,
    []
  );

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const text = input.trim();
      if (!text || isStreaming) return;
      setInput("");
      sendMessage({ text });
    },
    [input, isStreaming, sendMessage]
  );

  // "New chat": mint a fresh thread id, clear local messages, persist id.
  // Next send hits the server with the new id and creates a new row.
  const startNewThread = useCallback(() => {
    const id = newThreadId();
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THREAD_ID_KEY, id);
    }
    setInitialMessages([]);
    setMessages([]);
    setThreadId(id);
  }, [setMessages]);

  const handleClear = useCallback(() => {
    if (confirmClear) {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      setConfirmClear(false);
      startNewThread();
    } else {
      setConfirmClear(true);
      confirmTimerRef.current = setTimeout(() => setConfirmClear(false), 3000);
    }
  }, [confirmClear, startNewThread]);

  // Switch to an existing thread (e.g. from a sidebar list).
  const switchThread = useCallback(async (id: string) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THREAD_ID_KEY, id);
    }
    const history = await loadThreadMessages(id);
    setInitialMessages(history);
    setMessages(history);
    setThreadId(id);
  }, [setMessages]);

  // Listen for sidebar-driven thread switches. The sidebar lives in the
  // shared (app) layout and doesn't have direct access to this hook, so it
  // dispatches a custom event with the target thread id.
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      if (detail?.id) {
        void switchThread(detail.id);
      }
    }
    window.addEventListener("chat:switch-thread", handler);
    return () => window.removeEventListener("chat:switch-thread", handler);
  }, [switchThread]);

  return useMemo(
    () => ({
      threadId,
      hydrated,
      messages,
      input,
      setInput,
      isStreaming,
      error,
      clearError,
      stop,
      confirmClear,
      handleSubmit,
      handleClear,
      getMessageText,
      getMessageSources,
      getMessagePassages,
      getMessageRetrieval,
      getMessageFollowups,
      getMessageTitle,
      sendMessage,
      startNewThread,
      switchThread,
    }),
    [
      threadId,
      hydrated,
      messages,
      input,
      isStreaming,
      error,
      clearError,
      stop,
      confirmClear,
      handleSubmit,
      handleClear,
      getMessageText,
      getMessageSources,
      getMessagePassages,
      getMessageRetrieval,
      getMessageFollowups,
      getMessageTitle,
      sendMessage,
      startNewThread,
      switchThread,
    ]
  );
}
