"use client";

import { useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import SourcesList from "./SourcesList";
import { useChatSession } from "../hooks/use-chat-session";

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function ChatPanel({ open, onClose }: ChatPanelProps) {
  const {
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
    sendMessage,
    getMessageText,
    getMessageSources,
  } = useChatSession();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-focus input when panel opens
  useEffect(() => {
    if (open) {
      // Small delay to let animation start before focusing
      const t = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(t);
    }
  }, [open]);

  const SUGGESTIONS = [
    "What did I save about React?",
    "Summarize my AI articles",
    "Find connections between topics",
  ];

  function handleSuggestion(text: string) {
    setInput("");
    sendMessage({ text });
  }

  return (
    <>
      {/* Scrim — subtle backdrop when chat is open, click to close */}
      {open && (
        <div
          className="fixed inset-0 z-40"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.08)" }}
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Floating chat panel */}
      <div
        className="fixed z-50 flex flex-col"
        style={{
          bottom: 20,
          right: 20,
          width: 400,
          height: "min(600px, calc(100vh - 40px))",
          backgroundColor: "var(--color-bg-card)",
          borderRadius: 16,
          border: "1px solid var(--color-border)",
          boxShadow:
            "0 24px 48px -12px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04)",
          transform: open ? "translateY(0) scale(1)" : "translateY(16px) scale(0.96)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "transform 250ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms ease",
          transformOrigin: "bottom right",
        }}
        role="dialog"
        aria-label="Chat with your knowledge base"
        aria-hidden={!open}
      >
        {/* Header */}
        <div
          className="px-5 py-3.5 flex items-center justify-between flex-shrink-0"
          style={{
            borderBottom: "1px solid var(--color-border-subtle)",
            borderRadius: "16px 16px 0 0",
            backgroundColor: "var(--color-bg-primary)",
          }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "var(--color-accent-subtle)" }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ color: "var(--color-accent)" }}
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div>
              <h2
                className="font-[family-name:var(--font-heading)] text-[14px] font-semibold leading-tight"
                style={{ color: "var(--color-text-primary)" }}
              >
                Ask your knowledge base
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={handleClear}
                className="text-[11px] font-medium px-2 py-1 rounded-md transition-colors duration-150"
                style={{
                  color: confirmClear ? "var(--color-error)" : "var(--color-text-muted)",
                  backgroundColor: confirmClear ? "rgba(217, 79, 79, 0.08)" : "transparent",
                }}
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
                }}
              >
                {confirmClear ? "Clear?" : "New chat"}
              </button>
            )}
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-md transition-colors duration-150"
              style={{ color: "var(--color-text-muted)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--color-bg-secondary)";
                e.currentTarget.style.color = "var(--color-text-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.color = "var(--color-text-muted)";
              }}
              aria-label="Close chat"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center mt-8 fade-in">
              <p
                className="text-sm mb-1"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Ask anything about your saved content
              </p>
              <p
                className="text-xs mb-5 font-[family-name:var(--font-heading)] italic"
                style={{ color: "var(--color-text-muted)" }}
              >
                Answers are grounded in your knowledge base
              </p>

              <div className="space-y-1.5">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => handleSuggestion(suggestion)}
                    className="w-full text-left text-[13px] px-3.5 py-2.5 rounded-lg border transition-all duration-150"
                    style={{
                      borderColor: "var(--color-border-subtle)",
                      color: "var(--color-text-secondary)",
                      backgroundColor: "var(--color-bg-primary)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--color-accent)";
                      e.currentTarget.style.color = "var(--color-text-primary)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--color-border-subtle)";
                      e.currentTarget.style.color = "var(--color-text-secondary)";
                    }}
                  >
                    <span className="font-[family-name:var(--font-heading)] italic">
                      &ldquo;{suggestion}&rdquo;
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => {
            const text = getMessageText(msg);
            const isUser = msg.role === "user";
            const sources = isUser ? [] : getMessageSources(msg);
            const isLastStreaming =
              isStreaming && msg === messages[messages.length - 1] && msg.role === "assistant";

            return (
              <div
                key={msg.id}
                className={`max-w-[88%] ${isUser ? "ml-auto" : "mr-auto"}`}
              >
                <div
                  className="text-sm leading-relaxed rounded-lg px-3.5 py-2.5"
                  style={{
                    backgroundColor: isUser
                      ? "var(--color-accent)"
                      : "var(--color-bg-secondary)",
                    color: isUser ? "#ffffff" : "var(--color-text-primary)",
                    borderRadius: isUser
                      ? "16px 16px 4px 16px"
                      : "16px 16px 16px 4px",
                  }}
                >
                  {isUser ? (
                    text
                  ) : (
                    <div className={`chat-markdown-compact ${isLastStreaming ? "streaming-cursor" : ""}`}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                    </div>
                  )}
                </div>
                {sources.length > 0 && (
                  <SourcesList sources={sources} compact />
                )}
              </div>
            );
          })}

          {isStreaming && messages[messages.length - 1]?.role === "user" && (
            <div
              className="flex gap-1.5 px-3.5 py-2.5"
              style={{ color: "var(--color-text-muted)" }}
            >
              <span className="bounce-dot w-1.5 h-1.5 rounded-full bg-current" />
              <span className="bounce-dot w-1.5 h-1.5 rounded-full bg-current" />
              <span className="bounce-dot w-1.5 h-1.5 rounded-full bg-current" />
            </div>
          )}

          {error && (
            <div
              className="text-sm px-3.5 py-2.5 rounded-lg mr-auto"
              style={{
                backgroundColor: "rgba(217, 79, 79, 0.06)",
                color: "var(--color-error)",
              }}
            >
              Something went wrong.{" "}
              <button
                onClick={() => clearError()}
                className="underline underline-offset-2"
                style={{ color: "var(--color-accent)" }}
              >
                Dismiss
              </button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div
          className="px-4 py-3 flex-shrink-0"
          style={{
            borderTop: "1px solid var(--color-border-subtle)",
            borderRadius: "0 0 16px 16px",
            backgroundColor: "var(--color-bg-primary)",
          }}
        >
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question..."
              disabled={isStreaming}
              className="flex-1 text-sm px-3.5 py-2.5 rounded-lg border transition-all duration-150 focus:outline-none"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg-card)",
              }}
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
              <button
                type="button"
                onClick={() => stop()}
                className="px-3.5 py-2.5 rounded-lg text-sm font-medium text-white transition-all duration-150 hover:scale-[0.98] active:scale-[0.96]"
                style={{ backgroundColor: "var(--color-error)" }}
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="px-3.5 py-2.5 rounded-lg text-sm font-medium text-white transition-all duration-150 hover:scale-[0.98] active:scale-[0.96] disabled:opacity-40 disabled:pointer-events-none"
                style={{ backgroundColor: "var(--color-accent)" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            )}
          </form>
        </div>
      </div>
    </>
  );
}
