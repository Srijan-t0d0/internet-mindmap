"use client";

import { useRef, useEffect } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import SourcesList from "./SourcesList";
import PassageStrip from "./PassageStrip";
import ConsideredDrawer from "./ConsideredDrawer";
import FollowupChips from "./FollowupChips";
import { useChatSession, type ChatPassage } from "../hooks/use-chat-session";

// Map chunk-id suffix "...-c-<n>" to "c<n>"; otherwise fall back to first 6 chars.
function shortChunkLabel(id: string): string {
  const m = id.match(/-c-(\d+)$/);
  return m ? `c${m[1]}` : id.slice(0, 6);
}

// Preprocess model citations so ReactMarkdown renders them as badges:
//   [c:<chunkId>] → [cN](#cite-c-<chunkId>)   (N = passage index + 0)
//   [i:<itemId>]  → [src](#cite-i-<itemId>)
// The `components.a` override below styles these anchors as inline pill badges.
function preprocessCitations(text: string, passages: ChatPassage[]): string {
  return text
    .replace(/\[c:([\w-]+)\]/g, (_m, id) => {
      const label = shortChunkLabel(id);
      return `[${label}](#cite-c-${id})`;
    })
    .replace(/\[i:([\w-]+)\]/g, (_m, id) => {
      // If the item contributed a passage, reuse that passage's chunk label
      // so the user can cross-reference the inline cite with the strip below.
      const match = passages.find((p) => p.itemId === id);
      const label = match ? shortChunkLabel(match.chunkId) : "src";
      return `[${label}](#cite-i-${id})`;
    });
}

// ReactMarkdown `a` override. Normal links render as-is; anchors whose href
// starts with "#cite-" are the pre-processed citations and become badges.
const citationComponents: Components = {
  a({ href, children, ...rest }) {
    if (typeof href === "string" && href.startsWith("#cite-")) {
      return (
        <a
          href={href}
          onClick={(e) => {
            e.preventDefault();
            const targetId = href.slice(1); // drop leading #
            let el = document.getElementById(targetId);
            // `cite-i-<itemId>` may not have a direct id (the item may have
            // contributed no chunk passage); fall back to the first passage
            // card for that item via the data attribute.
            if (!el && targetId.startsWith("cite-i-")) {
              const itemId = targetId.slice("cite-i-".length);
              el = document.querySelector(
                `[data-cite-item="${CSS.escape(itemId)}"]`
              );
            }
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
              el.classList.add("citation-flash");
              setTimeout(() => el.classList.remove("citation-flash"), 1200);
            }
          }}
          className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded text-[10px] font-mono font-semibold tabular-nums align-baseline no-underline"
          style={{
            backgroundColor: "var(--color-accent-subtle)",
            color: "var(--color-accent)",
            verticalAlign: "baseline",
            lineHeight: 1.2,
          }}
          title="Jump to source"
        >
          {children}
        </a>
      );
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
        {children}
      </a>
    );
  },
};

const SUGGESTIONS = [
  "What did I save about React?",
  "Summarize my AI articles",
  "Find connections between topics",
  "What are the key themes in my saves?",
];

export default function ChatView() {
  const {
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
    sendMessage,
    getMessageText,
    getMessageSources,
    getMessagePassages,
    getMessageRetrieval,
    getMessageFollowups,
  } = useChatSession();

  // Avoid flashing the empty-state suggestions while we hydrate prior
  // messages from the saved thread on mount.
  const showEmptyState = hydrated && messages.length === 0;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, []);

  function handleSuggestion(text: string) {
    setInput("");
    sendMessage({ text });
  }

  const hasMessages = messages.length > 0;

  return (
    <div className="flex-1 h-screen flex flex-col overflow-hidden">
      {/* Messages area — scrollable, centered */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-6">
          {showEmptyState && (
            <div className="flex flex-col items-center justify-center min-h-[60vh] fade-in">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center mb-5"
                style={{ backgroundColor: "var(--color-accent-subtle)" }}
              >
                <svg
                  width="20"
                  height="20"
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
              <h1
                className="font-[family-name:var(--font-heading)] text-xl font-semibold mb-1"
                style={{ color: "var(--color-text-primary)" }}
              >
                Ask your knowledge base
              </h1>
              <p
                className="text-sm mb-8"
                style={{ color: "var(--color-text-muted)" }}
              >
                Answers are grounded in your saved content
              </p>

              <div className="grid grid-cols-2 gap-2.5 w-full max-w-lg">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => handleSuggestion(suggestion)}
                    className="text-left text-[14px] px-4 py-3.5 rounded-xl border transition-all duration-150"
                    style={{
                      borderColor: "var(--color-border-subtle)",
                      color: "var(--color-text-secondary)",
                      backgroundColor: "var(--color-bg-card)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--color-accent)";
                      e.currentTarget.style.color = "var(--color-text-primary)";
                      e.currentTarget.style.backgroundColor = "var(--color-bg-primary)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--color-border-subtle)";
                      e.currentTarget.style.color = "var(--color-text-secondary)";
                      e.currentTarget.style.backgroundColor = "var(--color-bg-card)";
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

          {hasMessages && (
            <div className="space-y-5 pb-4">
              {/* New chat header when messages exist */}
              <div className="flex items-center justify-between mb-2">
                <div />
                {messages.length > 0 && (
                  <button
                    onClick={handleClear}
                    className="text-[12px] font-medium px-2.5 py-1 rounded-md transition-colors duration-150"
                    style={{
                      color: confirmClear
                        ? "var(--color-error)"
                        : "var(--color-text-muted)",
                      backgroundColor: confirmClear
                        ? "rgba(217, 79, 79, 0.08)"
                        : "transparent",
                    }}
                    onMouseEnter={(e) => {
                      if (!confirmClear) {
                        e.currentTarget.style.color = "var(--color-accent)";
                        e.currentTarget.style.backgroundColor =
                          "var(--color-bg-secondary)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!confirmClear) {
                        e.currentTarget.style.color = "var(--color-text-muted)";
                        e.currentTarget.style.backgroundColor = "transparent";
                      }
                    }}
                  >
                    {confirmClear ? "Clear chat?" : "New chat"}
                  </button>
                )}
              </div>

              {messages.map((msg) => {
                const text = getMessageText(msg);
                const isUser = msg.role === "user";
                const sources = isUser ? [] : getMessageSources(msg);
                const passages = isUser ? [] : getMessagePassages(msg);
                const retrieval = isUser ? null : getMessageRetrieval(msg);
                const followups = isUser ? [] : getMessageFollowups(msg);
                const isLastStreaming =
                  isStreaming &&
                  msg === messages[messages.length - 1] &&
                  msg.role === "assistant";

                return (
                  <div
                    key={msg.id}
                    className={isUser ? "flex justify-end" : "flex gap-3"}
                  >
                    {/* Assistant avatar */}
                    {!isUser && (
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-1"
                        style={{ backgroundColor: "var(--color-bg-tertiary)" }}
                      >
                        <svg
                          width="13"
                          height="13"
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
                    )}
                    <div
                      className="min-w-0"
                      style={isUser ? { maxWidth: "80%" } : { flex: 1 }}
                    >
                      <div
                        className="text-[15px] leading-relaxed px-4 py-3"
                        style={{
                          backgroundColor: isUser
                            ? "var(--color-accent)"
                            : "var(--color-bg-secondary)",
                          color: isUser
                            ? "#ffffff"
                            : "var(--color-text-primary)",
                          borderRadius: isUser
                            ? "18px 18px 4px 18px"
                            : "18px 18px 18px 4px",
                        }}
                      >
                        {isUser ? (
                          text
                        ) : (
                          <div
                            className={`chat-markdown ${isLastStreaming ? "streaming-cursor" : ""}`}
                          >
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={citationComponents}
                            >
                              {preprocessCitations(text, passages)}
                            </ReactMarkdown>
                          </div>
                        )}
                      </div>
                      {!isUser && passages.length > 0 && (
                        <PassageStrip passages={passages} />
                      )}
                      {!isUser && passages.length === 0 && sources.length > 0 && (
                        <SourcesList sources={sources} />
                      )}
                      {!isUser && retrieval && !isLastStreaming && (
                        <ConsideredDrawer summary={retrieval} />
                      )}
                      {!isUser && followups.length > 0 && (
                        <FollowupChips
                          questions={followups}
                          onPick={(text) => {
                            setInput("");
                            sendMessage({ text });
                          }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Typing indicator */}
              {isStreaming &&
                messages[messages.length - 1]?.role === "user" && (
                  <div className="flex gap-3">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-1"
                      style={{ backgroundColor: "var(--color-bg-tertiary)" }}
                    >
                      <svg
                        width="13"
                        height="13"
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

              {/* Error */}
              {error && (
                <div
                  className="text-sm px-4 py-3 rounded-xl"
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
          )}
        </div>
      </div>

      {/* Input bar — fixed at bottom, centered */}
      <div
        className="flex-shrink-0 px-6 py-4"
        style={{
          borderTop: "1px solid var(--color-border-subtle)",
          backgroundColor: "var(--color-bg-primary)",
        }}
      >
        <form
          onSubmit={handleSubmit}
          className="max-w-2xl mx-auto flex gap-2.5"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            disabled={isStreaming}
            className="flex-1 text-[15px] px-4 py-3 rounded-xl border transition-all duration-150 focus:outline-none"
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
              className="px-5 py-3 rounded-xl text-[15px] font-medium text-white transition-all duration-150 hover:scale-[0.98] active:scale-[0.96]"
              style={{ backgroundColor: "var(--color-error)" }}
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="px-5 py-3 rounded-xl text-[15px] font-medium text-white transition-all duration-150 hover:scale-[0.98] active:scale-[0.96] disabled:opacity-40 disabled:pointer-events-none"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              Send
            </button>
          )}
        </form>
        <p
          className="text-[11px] text-center mt-2"
          style={{ color: "var(--color-text-muted)", opacity: 0.6 }}
        >
          Answers are grounded in your knowledge base
        </p>
      </div>
    </div>
  );
}
