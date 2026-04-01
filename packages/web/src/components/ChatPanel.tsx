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
        className="p-4 border-b flex items-center justify-between"
        style={{ borderColor: "var(--color-border)" }}
      >
        <h2
          className="font-[family-name:var(--font-heading)] text-base font-semibold"
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
            className="text-xs font-medium transition-colors"
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

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center mt-8">
            <p
              className="text-sm mb-2"
              style={{ color: "var(--color-text-muted)" }}
            >
              Ask anything about your saved content
            </p>
            <p
              className="text-xs"
              style={{ color: "var(--color-text-muted)" }}
            >
              &quot;What did I save about React?&quot;
            </p>
          </div>
        )}

        {messages.map((msg) => {
          const text = getMessageText(msg);
          return (
            <div
              key={msg.id}
              className={`text-sm leading-relaxed rounded-lg px-3 py-2 max-w-[90%] ${
                msg.role === "user" ? "ml-auto" : "mr-auto"
              }`}
              style={{
                backgroundColor:
                  msg.role === "user"
                    ? "var(--color-accent)"
                    : "var(--color-bg-secondary)",
                color: msg.role === "user" ? "#ffffff" : "var(--color-text-primary)",
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
            className="flex gap-1 px-3 py-2"
            style={{ color: "var(--color-text-muted)" }}
          >
            <span className="bounce-dot w-1.5 h-1.5 rounded-full bg-current" />
            <span className="bounce-dot w-1.5 h-1.5 rounded-full bg-current" />
            <span className="bounce-dot w-1.5 h-1.5 rounded-full bg-current" />
          </div>
        )}

        {error && (
          <div
            className="text-sm px-3 py-2 rounded-lg mr-auto"
            style={{ backgroundColor: "var(--color-bg-secondary)", color: "var(--color-status-error)" }}
          >
            Something went wrong.{" "}
            <button
              onClick={() => clearError()}
              className="underline"
              style={{ color: "var(--color-accent)" }}
            >
              Dismiss
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t" style={{ borderColor: "var(--color-border)" }}>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            disabled={isStreaming}
            className="flex-1 text-sm px-3 py-2 rounded-md border transition-colors focus:outline-none"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-bg-card)",
            }}
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={() => stop()}
              className="px-3 py-2 rounded-md text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: "var(--color-status-error, #ef4444)" }}
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="px-3 py-2 rounded-md text-sm font-medium text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              Send
            </button>
          )}
        </form>
      </div>
    </aside>
  );
}
