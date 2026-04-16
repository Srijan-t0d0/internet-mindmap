"use client";

import { useState, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { SourceUrlUIPart } from "ai";

// All /api/* calls go through the Next.js route handler proxy (same-origin).
const API_BASE = "";

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

/**
 * Shared chat session logic used by ChatView.
 * Encapsulates useChat setup, input state, confirm-clear flow, and message helpers.
 */
export function useChatSession() {
  const [input, setInput] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { messages, sendMessage, status, error, clearError, stop, setMessages } = useChat({
    transport: chatTransport,
    onError: (err) => console.error("[chat]", err),
  });

  const isStreaming = status === "streaming" || status === "submitted";

  function getMessageText(msg: (typeof messages)[number]): string {
    return msg.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");
  }

  function getMessageSources(msg: (typeof messages)[number]): SourceUrlUIPart[] {
    return msg.parts.filter(
      (p): p is SourceUrlUIPart => p.type === "source-url"
    );
  }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    sendMessage({ text });
  }

  function handleClear() {
    if (confirmClear) {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      setConfirmClear(false);
      setMessages([]);
    } else {
      setConfirmClear(true);
      confirmTimerRef.current = setTimeout(() => setConfirmClear(false), 3000);
    }
  }

  return {
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
    sendMessage,
  };
}
