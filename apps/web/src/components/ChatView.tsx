"use client";

import { useRef, useEffect } from "react";
import type { UIMessage } from "ai";
import type { SourceUrlUIPart } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import SourcesList from "./SourcesList";
import { useChatSession } from "../hooks/use-chat-session";

const SUGGESTIONS = [
  "What did I save about React?",
  "Summarize my articles on AI",
  "What are the key takeaways from my reading list?",
  "Find connections between my saved topics",
];

export default function ChatView() {
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSuggestion(text: string) {
    setInput("");
    sendMessage({ text });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div>
          <h2
            className="font-[family-name:var(--font-heading)] text-lg font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Chat with your knowledge base
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            Ask questions about your saved content
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleClear}
            className="text-xs font-medium px-3 py-1.5 rounded-md transition-colors duration-150"
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
            {confirmClear ? "Confirm clear?" : "New chat"}
          </button>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="text-center mt-16 fade-in">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ backgroundColor: "var(--color-bg-secondary)" }}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <p
                className="text-base mb-2"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Ask anything about your saved content
              </p>
              <p
                className="text-sm mb-8"
                style={{ color: "var(--color-text-muted)" }}
              >
                Your answers are grounded in your personal knowledge base
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg mx-auto">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => handleSuggestion(suggestion)}
                    className="text-left text-sm px-4 py-3 rounded-lg border transition-all duration-150"
                    style={{
                      borderColor: "var(--color-border-subtle)",
                      color: "var(--color-text-secondary)",
                      backgroundColor: "var(--color-bg-card)",
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

          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              isLastAssistant={
                isStreaming &&
                msg === messages[messages.length - 1] &&
                msg.role === "assistant"
              }
              getMessageText={getMessageText}
              getMessageSources={getMessageSources}
            />
          ))}

          {isStreaming && messages[messages.length - 1]?.role === "user" && (
            <div className="flex items-center gap-3 max-w-2xl">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: "var(--color-bg-secondary)" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "var(--color-text-muted)" }}>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div
                className="flex gap-1.5 px-4 py-3"
                style={{ color: "var(--color-text-muted)" }}
              >
                <span className="bounce-dot w-1.5 h-1.5 rounded-full bg-current" />
                <span className="bounce-dot w-1.5 h-1.5 rounded-full bg-current" />
                <span className="bounce-dot w-1.5 h-1.5 rounded-full bg-current" />
              </div>
            </div>
          )}

          {error && (
            <div
              className="text-sm px-4 py-3 rounded-lg max-w-2xl"
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
      </div>

      {/* Input bar */}
      <div
        className="px-6 py-4 border-t flex-shrink-0"
        style={{ borderColor: "var(--color-border)" }}
      >
        <form
          onSubmit={handleSubmit}
          className="max-w-2xl mx-auto flex gap-3"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about your saved content..."
            disabled={isStreaming}
            className="flex-1 text-sm px-4 py-3 rounded-lg border transition-all duration-150 focus:outline-none"
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
              className="px-4 py-3 rounded-lg text-sm font-medium text-white transition-all duration-150 hover:scale-[0.98] active:scale-[0.96]"
              style={{ backgroundColor: "var(--color-error)" }}
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="px-4 py-3 rounded-lg text-sm font-medium text-white transition-all duration-150 hover:scale-[0.98] active:scale-[0.96] disabled:opacity-40 disabled:pointer-events-none"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              Send
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

// ─── Individual message component ────────────────────────────────────────────

function ChatMessage({
  message,
  isLastAssistant,
  getMessageText,
  getMessageSources,
}: {
  message: UIMessage;
  isLastAssistant: boolean;
  getMessageText: (msg: UIMessage) => string;
  getMessageSources: (msg: UIMessage) => SourceUrlUIPart[];
}) {
  const isUser = message.role === "user";
  const text = getMessageText(message);
  const sources = isUser ? [] : getMessageSources(message);

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div
          className="text-sm leading-relaxed px-4 py-3 max-w-[75%]"
          style={{
            backgroundColor: "var(--color-accent)",
            color: "#ffffff",
            borderRadius: "16px 16px 4px 16px",
          }}
        >
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-1"
        style={{ backgroundColor: "var(--color-bg-secondary)" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "var(--color-text-muted)" }}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={`chat-markdown text-sm leading-relaxed ${isLastAssistant ? "streaming-cursor" : ""}`}
          style={{ color: "var(--color-text-primary)" }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </div>
        {sources.length > 0 && <SourcesList sources={sources} />}
      </div>
    </div>
  );
}
