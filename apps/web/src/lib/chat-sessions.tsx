"use client";

import { createContext, use, useState, type ReactNode } from "react";
import { Chat } from "@ai-sdk/react";
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { DefaultChatTransport, type ChatTransport, type UIMessage } from "ai";

export type ChatStage = "searching" | "ranking" | "writing";

export function getProgressStage(part: { type: string; data?: unknown }): ChatStage | null {
  if (part.type !== "data-status" || !part.data || typeof part.data !== "object") return null;
  const stage = "stage" in part.data ? part.data.stage : null;
  return stage === "searching" || stage === "ranking" || stage === "writing" ? stage : null;
}

function getHeaders(): Record<string, string> {
  const token = process.env.NEXT_PUBLIC_API_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
const chatTransport = new DefaultChatTransport({ api: "/api/chat", headers: getHeaders });

export async function loadThreadMessages(threadId: string, signal?: AbortSignal): Promise<UIMessage[]> {
  const res = await fetch(`/api/threads/${encodeURIComponent(threadId)}`, {
    credentials: "include", headers: getHeaders(), signal,
  });
  if (res.status === 404) return []; // New threads aren't persisted until their first turn.
  if (!res.ok) throw new Error(`Could not load conversation (${res.status}).`);
  const data = (await res.json()) as { messages?: UIMessage[] };
  return data.messages ?? [];
}

export function threadMessagesQueryOptions(threadId: string) {
  return queryOptions({
    queryKey: ["thread-messages", threadId],
    staleTime: 60_000,
    queryFn: ({ signal }) => loadThreadMessages(threadId, signal),
  });
}

type SessionState = { hydrated: boolean; historyError: string | null; progress: ChatStage | null };

export function createChatSession(id: string, queryClient: QueryClient, options: {
  newThread?: boolean;
  transport?: ChatTransport<UIMessage>;
} = {}) {
  let state: SessionState = { hydrated: options.newThread ?? false, historyError: null, progress: null };
  let loading: Promise<void> | null = null;
  let sending = false;
  let acceptingProgress = false;
  const listeners = new Set<() => void>();
  function update(patch: Partial<SessionState>) {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  }
  const chat = new Chat<UIMessage>({
    id, transport: options.transport ?? chatTransport,
    onData(part) {
      const stage = getProgressStage(part);
      if (acceptingProgress && stage) update({ progress: stage });
    },
    onFinish({ messages, isAbort, isError }) {
      // These callbacks belong to this instance, never the currently selected thread.
      if (!isAbort && !isError) queryClient.setQueryData(threadMessagesQueryOptions(id).queryKey, messages);
      if (messages.length && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("chat:threads-changed"));
      }
    },
    onError: (err) => console.error("[chat]", err),
  });
  return {
    chat,
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    load() {
      if (loading) return loading;
      if (state.hydrated && !state.historyError) return Promise.resolve();
      update({ hydrated: false, historyError: null });
      // A switch doesn't cancel hydration: it finishes into its own retained instance.
      loading = queryClient.fetchQuery(threadMessagesQueryOptions(id)).then((history) => {
        chat.messages = history;
        update({ hydrated: true });
      }).catch((err: unknown) => {
        update({ hydrated: true, historyError: err instanceof Error ? err.message : "Could not load conversation." });
      }).finally(() => { loading = null; });
      return loading;
    },
    async sendText(text: string, model?: string) {
      if (!state.hydrated || state.historyError || sending || chat.status === "streaming" || chat.status === "submitted" || !text.trim()) return;
      sending = true;
      acceptingProgress = true;
      update({ progress: null });
      try {
        // Explicit parts skip async file conversion, so stop() can cancel immediately.
        await chat.sendMessage({ parts: [{ type: "text", text: text.trim() }] }, { body: model ? { model } : {} });
      } finally {
        sending = false;
        acceptingProgress = false;
        update({ progress: null });
      }
    },
    stop() {
      acceptingProgress = false;
      update({ progress: null });
      void chat.stop();
    },
  };
}

type ChatSession = ReturnType<typeof createChatSession>;
export type ChatSessions = Map<string, ChatSession>;

export function getChatSession(sessions: ChatSessions, id: string, queryClient: QueryClient, newThread = false) {
  let session = sessions.get(id);
  if (!session) {
    session = createChatSession(id, queryClient, { newThread });
    sessions.set(id, session);
  }
  return session;
}

const ChatSessionsContext = createContext<ChatSessions | null>(null);

export function ChatSessionsProvider({ children }: { children: ReactNode }) {
  // ponytail: retain visited chats for this browser session; add idle eviction if memory becomes an issue.
  const [sessions] = useState<ChatSessions>(() => new Map());
  return <ChatSessionsContext value={sessions}>{children}</ChatSessionsContext>;
}

export function useChatSessions() {
  const sessions = use(ChatSessionsContext);
  if (!sessions) throw new Error("ChatSessionsProvider is required.");
  return sessions;
}
