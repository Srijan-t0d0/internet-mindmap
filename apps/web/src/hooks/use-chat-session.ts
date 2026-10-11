"use client";

import { useState, useRef, useEffect, useCallback, useSyncExternalStore } from "react";
import { useChat } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import type { UIMessage, SourceUrlUIPart } from "ai";
import { THREAD_ID_KEY } from "../lib/threads";
import { createChatSession, getChatSession, useChatSessions } from "../lib/chat-sessions";
export { getProgressStage, loadThreadMessages, threadMessagesQueryOptions, type ChatStage } from "../lib/chat-sessions";

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

function newThreadId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `t-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// Storage can be unavailable (e.g. privacy settings); the in-memory session still works.
function rememberThread(id: string) {
  try { window.localStorage.setItem(THREAD_ID_KEY, id); } catch { /* optional persistence */ }
}

export function useChatSession() {
  const queryClient = useQueryClient();
  const sessions = useChatSessions();
  const [pendingSession] = useState(() => createChatSession("pending-history", queryClient));
  const [threadId, setThreadId] = useState<string | null>(null);
  const [model, setModel] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const session = threadId ? getChatSession(sessions, threadId, queryClient) : pendingSession;
  const { hydrated, historyError, progress } = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const { messages, status, error, clearError } = useChat({ chat: session.chat });
  const isStreaming = status === "streaming" || status === "submitted";
  const canSend = hydrated && !historyError && !isStreaming;

  useEffect(() => {
    let stored: string | null = null;
    try { stored = window.localStorage.getItem(THREAD_ID_KEY); } catch { /* optional persistence */ }
    const id = stored ?? newThreadId();
    getChatSession(sessions, id, queryClient, !stored);
    rememberThread(id);
    setThreadId(id);
  }, [sessions, queryClient]);

  useEffect(() => {
    if (threadId) void session.load();
  }, [threadId, session]);

  const switchThread = useCallback((id: string) => {
    if (id === threadId) return;
    session.stop();
    setConfirmClear(false);
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    rememberThread(id);
    setThreadId(id);
  }, [session, threadId]);

  const startNewThread = useCallback(() => {
    const id = newThreadId();
    getChatSession(sessions, id, queryClient, true);
    switchThread(id);
  }, [sessions, queryClient, switchThread]);
  const retryHistory = useCallback(() => { void session.load(); }, [session]);
  const sendText = useCallback((text: string) => { void session.sendText(text, model || undefined); }, [session, model]);
  const stop = useCallback(() => session.stop(), [session]);

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
    model, setModel, progress, error, clearError, stop, confirmClear, handleClear, sendText, startNewThread, switchThread,
  };
}
