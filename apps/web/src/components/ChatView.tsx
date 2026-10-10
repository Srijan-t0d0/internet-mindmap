"use client";

import React, { memo, useState, useRef, useEffect } from "react";
import ChatMessage from "./ChatMessage";
import { useChatSession, type ChatStage } from "../hooks/use-chat-session";

const SUGGESTIONS = [
  "What did I save about React?",
  "Summarize my AI articles",
  "Find connections between topics",
  "What are the key themes in my saves?",
];
const PROGRESS_LABELS: Record<ChatStage, string> = {
  searching: "Searching your knowledge base…",
  ranking: "Ranking relevant sources…",
  writing: "Writing your answer…",
};

// Draft state stays here: typing does not render the transcript or parse Markdown.
const ChatComposer = memo(function ChatComposer({ canSend, isStreaming, sendText, stop, messageCount }: {
  canSend: boolean;
  isStreaming: boolean;
  sendText: (text: string) => void;
  stop: () => void;
  messageCount: number;
}) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setInput(""); }, [messageCount]);
  useEffect(() => {
    if (canSend) inputRef.current?.focus();
  }, [canSend]);
  return (
    <div className="flex-shrink-0 px-6 py-4" style={{ borderTop: "1px solid var(--color-border-subtle)", backgroundColor: "var(--color-bg-primary)" }}>
      <form onSubmit={(e) => {
        e.preventDefault();
        if (!canSend || !input.trim()) return;
        sendText(input);
        setInput("");
      }} className="max-w-2xl mx-auto flex gap-2.5">
        <input
          ref={inputRef}
          type="text"
          aria-label="Ask your knowledge base"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question..."
          disabled={!canSend}
          className="flex-1 text-[15px] px-4 py-3 rounded-xl border transition-all duration-150 focus:outline-none"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-card)" }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--color-accent)";
            e.currentTarget.style.boxShadow = "var(--shadow-search-focus)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--color-border)";
            e.currentTarget.style.boxShadow = "none";
          }}
        />
        {isStreaming ? (
          <button type="button" onClick={stop} className="px-5 py-3 rounded-xl text-[15px] font-medium text-white transition-all duration-150 hover:scale-[0.98] active:scale-[0.96]" style={{ backgroundColor: "var(--color-error)" }}>Stop</button>
        ) : (
          <button type="submit" disabled={!canSend || !input.trim()} className="px-5 py-3 rounded-xl text-[15px] font-medium text-white transition-all duration-150 hover:scale-[0.98] active:scale-[0.96] disabled:opacity-40 disabled:pointer-events-none" style={{ backgroundColor: "var(--color-accent)" }}>Send</button>
        )}
      </form>
      <p className="text-[11px] text-center mt-2" style={{ color: "var(--color-text-muted)", opacity: 0.6 }}>Answers are grounded in your knowledge base</p>
    </div>
  );
});

export default function ChatView() {
  const {
    threadId, hydrated, historyError, retryHistory, startNewThread,
    messages, isStreaming, canSend, progress, error, clearError, stop,
    confirmClear, handleClear, sendText,
  } = useChatSession();
  const showEmptyState = hydrated && !historyError && messages.length === 0;
  const scrollRef = useRef<HTMLDivElement>(null);
  const followBottomRef = useRef(true);

  useEffect(() => { followBottomRef.current = true; }, [threadId]);
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !followBottomRef.current) return;
    // No animated scroll per token. "instant" also overrides CSS smooth scrolling
    // and respects reduced motion. A reader who scrolls up keeps their position.
    container.scrollTo({ top: container.scrollHeight, behavior: "instant" });
  }, [messages, hydrated, progress]);

  return (
    <div className="flex-1 h-screen flex flex-col overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-y-auto" aria-busy={!hydrated}
        onScroll={(e) => {
          const el = e.currentTarget;
          followBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}>
        <div className="max-w-2xl mx-auto px-6 py-6">
          {!hydrated && <p role="status" className="text-sm py-6" style={{ color: "var(--color-text-muted)" }}>Loading conversation…</p>}
          {historyError && (
            <div role="alert" className="text-sm px-4 py-3 rounded-xl" style={{ backgroundColor: "rgba(217, 79, 79, 0.06)", color: "var(--color-error)" }}>
              {historyError}{" "}
              <button onClick={retryHistory} className="underline underline-offset-2">Retry</button>{" · "}
              <button onClick={startNewThread} className="underline underline-offset-2">New chat</button>
            </div>
          )}
          {showEmptyState && (
            <div className="flex flex-col items-center justify-center min-h-[60vh] fade-in">
              <div className="w-10 h-10 rounded-full flex items-center justify-center mb-5" style={{ backgroundColor: "var(--color-accent-subtle)" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-accent)" }}>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <h1 className="font-[family-name:var(--font-heading)] text-xl font-semibold mb-1" style={{ color: "var(--color-text-primary)" }}>Ask your knowledge base</h1>
              <p className="text-sm mb-8" style={{ color: "var(--color-text-muted)" }}>Answers are grounded in your saved content</p>
              <div className="grid grid-cols-2 gap-2.5 w-full max-w-lg">
                {SUGGESTIONS.map((suggestion) => (
                  <button key={suggestion} onClick={() => sendText(suggestion)} disabled={!canSend}
                    className="text-left text-[14px] px-4 py-3.5 rounded-xl border transition-all duration-150"
                    style={{ borderColor: "var(--color-border-subtle)", color: "var(--color-text-secondary)", backgroundColor: "var(--color-bg-card)" }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--color-accent)";
                      e.currentTarget.style.color = "var(--color-text-primary)";
                      e.currentTarget.style.backgroundColor = "var(--color-bg-primary)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--color-border-subtle)";
                      e.currentTarget.style.color = "var(--color-text-secondary)";
                      e.currentTarget.style.backgroundColor = "var(--color-bg-card)";
                    }}>
                    <span className="font-[family-name:var(--font-heading)] italic">&ldquo;{suggestion}&rdquo;</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.length > 0 && (
            <div className="space-y-5 pb-4">
              <div className="flex items-center justify-between mb-2">
                <div />
                <button onClick={handleClear} className="text-[12px] font-medium px-2.5 py-1 rounded-md transition-colors duration-150"
                  style={{ color: confirmClear ? "var(--color-error)" : "var(--color-text-muted)", backgroundColor: confirmClear ? "rgba(217, 79, 79, 0.08)" : "transparent" }}
                  onMouseEnter={(e) => {
                    if (!confirmClear) {
                      e.currentTarget.style.color = "var(--color-accent)";
                      e.currentTarget.style.backgroundColor = "var(--color-bg-secondary)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!confirmClear) {
                      e.currentTarget.style.color = "var(--color-text-muted)";
                      e.currentTarget.style.backgroundColor = "transparent";
                    }
                  }}>{confirmClear ? "Clear chat?" : "New chat"}</button>
              </div>
              {messages.map((message, index) => (
                <ChatMessage key={message.id} message={message}
                  isStreaming={isStreaming && index === messages.length - 1 && message.role === "assistant"}
                  onPick={sendText} />
              ))}
              {isStreaming && messages[messages.length - 1]?.role === "user" && (
                <div className="flex gap-3" aria-hidden="true">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-1" style={{ backgroundColor: "var(--color-bg-tertiary)" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-text-muted)" }}>
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <div className="flex gap-1.5 px-4 py-3" style={{ color: "var(--color-text-muted)" }}>
                    <span className="bounce-dot w-1.5 h-1.5 rounded-full bg-current" />
                    <span className="bounce-dot w-1.5 h-1.5 rounded-full bg-current" />
                    <span className="bounce-dot w-1.5 h-1.5 rounded-full bg-current" />
                  </div>
                </div>
              )}
            </div>
          )}
          {isStreaming && <p role="status" className="text-sm py-3" style={{ color: "var(--color-text-muted)" }}>{progress ? PROGRESS_LABELS[progress] : "Preparing your answer…"}</p>}
          {error && (
            <div role="alert" className="text-sm px-4 py-3 rounded-xl" style={{ backgroundColor: "rgba(217, 79, 79, 0.06)", color: "var(--color-error)" }}>
              {error.message === "No saved items found. Save some content first!" ? error.message : "Something went wrong. Please try again."}{" "}<button onClick={() => clearError()} className="underline underline-offset-2" style={{ color: "var(--color-accent)" }}>Dismiss</button>
            </div>
          )}
        </div>
      </div>
      <ChatComposer key={threadId} canSend={canSend} isStreaming={isStreaming} sendText={sendText} stop={stop} messageCount={messages.length} />
    </div>
  );
}
