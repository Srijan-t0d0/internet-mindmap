import { useState, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

const API_BASE = import.meta.env.VITE_API_URL || "";

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  const token = import.meta.env.VITE_API_TOKEN;
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

export default function ChatPanel() {
  const [input, setInput] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, error, clearError, stop, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: `${API_BASE}/api/chat`,
      headers: getHeaders,
    }),
    onError: (err) => console.error("[chat]", err),
  });

  const isStreaming = status === "streaming" || status === "submitted";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function getMessageText(msg: (typeof messages)[number]): string {
    return msg.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");
  }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    sendMessage({ text });
  }

  return (
    <aside
      className="w-80 h-screen flex-shrink-0 flex flex-col border-l"
      style={{
        backgroundColor: "var(--color-bg-primary)",
        borderColor: "var(--color-border)",
        boxShadow: "var(--shadow-panel)",
      }}
    >
      <div
        className="px-5 py-4 border-b flex items-center justify-between"
        style={{ borderColor: "var(--color-border)" }}
      >
        <h2
          className="font-[family-name:var(--font-heading)] text-[15px] font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Ask your knowledge base
        </h2>
        {messages.length > 0 && (
          <button
            onClick={() => {
              if (confirmClear) {
                if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
                setConfirmClear(false);
                setMessages([]);
              } else {
                setConfirmClear(true);
                confirmTimerRef.current = setTimeout(() => setConfirmClear(false), 3000);
              }
            }}
            className="text-[11px] font-medium transition-colors duration-150"
            style={{ color: confirmClear ? "var(--color-error)" : "var(--color-text-muted)" }}
            onMouseEnter={(e) => {
              if (!confirmClear) e.currentTarget.style.color = "var(--color-accent)";
            }}
            onMouseLeave={(e) => {
              if (!confirmClear) e.currentTarget.style.color = "var(--color-text-muted)";
            }}
          >
            {confirmClear ? "Clear chat?" : "New chat"}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center mt-12 fade-in">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3"
              style={{ backgroundColor: "var(--color-bg-secondary)" }}
            >
              <svg
                width="18"
                height="18"
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
              className="text-sm mb-1.5"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Ask anything about your saved content
            </p>
            <p
              className="text-xs font-[family-name:var(--font-heading)] italic"
              style={{ color: "var(--color-text-muted)" }}
            >
              "What did I save about React?"
            </p>
          </div>
        )}

        {messages.map((msg) => {
          const text = getMessageText(msg);
          const isUser = msg.role === "user";
          return (
            <div
              key={msg.id}
              className={`text-sm leading-relaxed rounded-lg px-3.5 py-2.5 max-w-[88%] ${
                isUser ? "ml-auto" : "mr-auto"
              }`}
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
              <span
                className={
                  isStreaming && msg === messages[messages.length - 1] && msg.role === "assistant"
                    ? "streaming-cursor"
                    : ""
                }
              >
                {text}
              </span>
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

      <div
        className="px-4 py-3 border-t"
        style={{ borderColor: "var(--color-border)" }}
      >
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
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
    </aside>
  );
}
