"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage, type SourceUrlUIPart } from "ai";
import { THREAD_ID_KEY } from "../lib/threads";

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

export type ChatStage = "searching" | "ranking" | "writing";

export function getProgressStage(part: { type: string; data?: unknown }): ChatStage | null {
  if (part.type !== "data-status" || !part.data || typeof part.data !== "object") return null;
  const stage = "stage" in part.data ? part.data.stage : null;
  return stage === "searching" || stage === "ranking" || stage === "writing" ? stage : null;
}

type DataPart =
  | { type: "data-passages"; data: { passages: ChatPassage[] } }
  | { type: "data-retrieval"; data: ChatRetrievalSummary }
  | { type: "data-followups"; data: { questions: string[] } }
  | { type: "data-title"; data: { title: string } };

function findDataPart<T extends DataPart["type"]>(msg: UIMessage, type: T): Extract<DataPart, { type: T }> | undefined {
  for (let i = msg.parts.length - 1; i >= 0; i--) {
    if (msg.parts[i].type === type) return msg.parts[i] as Extract<DataPart, { type: T }>;
  }
  return undefined;
}

export function getMessageText(msg: UIMessage): string {
  return msg.parts.filter((p) => p.type === "text").map((p) => p.text).join("");
}
export function getMessageSources(msg: UIMessage): SourceUrlUIPart[] {
  return msg.parts.filter((p): p is SourceUrlUIPart => p.type === "source-url");
}
export function getMessagePassages(msg: UIMessage): ChatPassage[] {
  return findDataPart(msg, "data-passages")?.data.passages ?? [];
}
export function getMessageRetrieval(msg: UIMessage): ChatRetrievalSummary | null {
  return findDataPart(msg, "data-retrieval")?.data ?? null;
}
export function getMessageFollowups(msg: UIMessage): string[] {
  return findDataPart(msg, "data-followups")?.data.questions ?? [];
}

function getHeaders(): Record<string, string> {
  const token = process.env.NEXT_PUBLIC_API_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
const chatTransport = new DefaultChatTransport({ api: "/api/chat", headers: getHeaders });

function newThreadId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `t-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// Storage can be unavailable (e.g. privacy settings); the in-memory session still works.
function rememberThread(id: string) {
  try { window.localStorage.setItem(THREAD_ID_KEY, id); } catch { /* optional persistence */ }
}

export async function loadThreadMessages(threadId: string, signal?: AbortSignal): Promise<UIMessage[]> {
  const res = await fetch(`/api/threads/${encodeURIComponent(threadId)}`, {
    credentials: "include",
    headers: getHeaders(),
    signal,
  });
  if (res.status === 404) return []; // New threads aren't persisted until their first turn.
  if (!res.ok) throw new Error(`Could not load conversation (${res.status}).`);
  const data = (await res.json()) as { messages?: UIMessage[] };
  return data.messages ?? [];
}

export function useChatSession() {
  const [confirmClear, setConfirmClear] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [progress, setProgress] = useState<ChatStage | null>(null);
  const readyRef = useRef(false);
  const sendGateRef = useRef(false);
  const acceptingProgressRef = useRef(false);
  const turnRef = useRef(0);
  const historyRequestRef = useRef<AbortController | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { messages, sendMessage: sdkSendMessage, status, error, clearError, stop: sdkStop, setMessages } = useChat({
    id: threadId ?? "pending-history",
    transport: chatTransport,
    onData(part) {
      const stage = getProgressStage(part);
      // AI SDK routes transient data to onData without adding it to message.parts.
      if (readyRef.current && acceptingProgressRef.current && stage) setProgress(stage);
    },
    onError: (err) => console.error("[chat]", err),
  });
  const isStreaming = status === "streaming" || status === "submitted";
  const canSend = hydrated && !historyError && !isStreaming;
  sendGateRef.current = canSend;

  useEffect(() => {
    let stored: string | null = null;
    try { stored = window.localStorage.getItem(THREAD_ID_KEY); } catch { /* optional persistence */ }
    const id = stored ?? newThreadId();
    rememberThread(id);
    setThreadId(id);
  }, []);

  // Key history loading on the selected id, not on the request completion.
  // Cleanup and the abort check protect against responses racing a thread switch.
  useEffect(() => {
    if (!threadId) return;
    const controller = new AbortController();
    historyRequestRef.current = controller;
    readyRef.current = false;
    setHydrated(false);
    setHistoryError(null);
    void loadThreadMessages(threadId, controller.signal).then((history) => {
      if (controller.signal.aborted) return;
      setMessages(history);
      readyRef.current = true;
    }).catch((err: unknown) => {
      if (controller.signal.aborted) return;
      setHistoryError(err instanceof Error ? err.message : "Could not load conversation.");
    }).finally(() => {
      if (!controller.signal.aborted) setHydrated(true);
    });
    return () => controller.abort();
  }, [threadId, historyRevision, setMessages]);

  const prevStatusRef = useRef(status);
  useEffect(() => {
    if (!isStreaming) setProgress(null);
    if (prevStatusRef.current !== "ready" && status === "ready" && messages.length > 0) {
      window.dispatchEvent(new CustomEvent("chat:threads-changed"));
    }
    prevStatusRef.current = status;
  }, [status, isStreaming, messages.length]);

  const sendText = useCallback((text: string) => {
    if (!readyRef.current || !sendGateRef.current || !text.trim()) return;
    sendGateRef.current = false;
    acceptingProgressRef.current = true;
    setProgress(null);
    const turn = ++turnRef.current;
    void sdkSendMessage({ text: text.trim() }).finally(() => {
      // An old turn finishing after a switch must not clear the new turn's status.
      if (turn !== turnRef.current) return;
      acceptingProgressRef.current = false;
      setProgress(null);
    });
  }, [sdkSendMessage]);

  const stop = useCallback(() => {
    acceptingProgressRef.current = false;
    setProgress(null);
    void sdkStop();
  }, [sdkStop]);

  const switchThread = useCallback((id: string) => {
    // Close the send gate and cancel synchronously, before React effects run.
    readyRef.current = false;
    turnRef.current += 1;
    historyRequestRef.current?.abort();
    stop();
    clearError();
    setProgress(null);
    setHydrated(false);
    setHistoryError(null);
    setMessages([]);
    setConfirmClear(false);
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    rememberThread(id);
    setThreadId(id);
    setHistoryRevision((revision) => revision + 1);
  }, [stop, clearError, setMessages]);

  const startNewThread = useCallback(() => switchThread(newThreadId()), [switchThread]);
  const retryHistory = useCallback(() => {
    if (threadId) switchThread(threadId);
  }, [threadId, switchThread]);

  const handleClear = useCallback(() => {
    if (confirmClear) {
      startNewThread();
    } else {
      setConfirmClear(true);
      confirmTimerRef.current = setTimeout(() => setConfirmClear(false), 3000);
    }
  }, [confirmClear, startNewThread]);

  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      if (typeof detail?.id === "string" && detail.id) switchThread(detail.id);
    }
    window.addEventListener("chat:switch-thread", handler);
    return () => window.removeEventListener("chat:switch-thread", handler);
  }, [switchThread]);

  useEffect(() => () => {
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
  }, []);

  return {
    threadId, hydrated, historyError, retryHistory, messages, isStreaming, canSend,
    progress, error, clearError, stop, confirmClear, handleClear, sendText, startNewThread, switchThread,
  };
}
