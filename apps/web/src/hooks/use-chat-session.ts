"use client";

import { useState, useRef, useEffect, useCallback, useSyncExternalStore } from "react";
import { useChat } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import type { UIMessage, SourceUrlUIPart } from "ai";
import { useSearchParams } from "next/navigation";
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

export function useChatSession() {
  const queryClient = useQueryClient();
  const sessions = useChatSessions();
  // `/chat?t=<id>` is a saved thread; bare `/chat` is a fresh draft that gets its URL on first send.
  const urlThreadId = useSearchParams().get("t");
  const [pendingSession] = useState(() => createChatSession("pending-history", queryClient));
  const [draftId, setDraftId] = useState<string | null>(null);
  const threadId = urlThreadId ?? draftId;
  const [model, setModel] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const session = threadId ? getChatSession(sessions, threadId, queryClient) : pendingSession;
  const { hydrated, historyError, progress } = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const { messages, status, error, clearError } = useChat({ chat: session.chat });
  const isStreaming = status === "streaming" || status === "submitted";
  const canSend = hydrated && !historyError && !isStreaming;

  const startNewThread = useCallback(() => {
    const id = newThreadId();
    getChatSession(sessions, id, queryClient, true);
    setDraftId(id);
    if (urlThreadId) window.history.pushState(null, "", "/chat");
  }, [sessions, queryClient, urlThreadId]);

  useEffect(() => {
    if (!urlThreadId && !draftId) startNewThread();
  }, [urlThreadId, draftId, startNewThread]);

  useEffect(() => {
    if (threadId) void session.load();
  }, [threadId, session]);

  // Leaving a thread (sidebar link, back button, new chat) stops its stream.
  const prevSessionRef = useRef(session);
  useEffect(() => {
    if (prevSessionRef.current === session) return;
    prevSessionRef.current.stop();
    prevSessionRef.current = session;
    setConfirmClear(false);
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
  }, [session]);

  const retryHistory = useCallback(() => { void session.load(); }, [session]);
  const sendText = useCallback((text: string) => {
    // Native pushState keeps this component (and the in-flight stream) mounted; Next syncs useSearchParams.
    if (!urlThreadId && threadId) window.history.pushState(null, "", `/chat?t=${threadId}`);
    void session.sendText(text, model || undefined);
  }, [session, model, urlThreadId, threadId]);
  const stop = useCallback(() => session.stop(), [session]);

  const handleClear = useCallback(() => {
    if (confirmClear) {
      startNewThread();
    } else {
      setConfirmClear(true);
      confirmTimerRef.current = setTimeout(() => setConfirmClear(false), 3000);
    }
  }, [confirmClear, startNewThread]);

  useEffect(() => () => {
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
  }, []);

  return {
    threadId, hydrated, historyError, retryHistory, messages, isStreaming, canSend,
    model, setModel, progress, error, clearError, stop, confirmClear, handleClear, sendText, startNewThread,
  };
}
