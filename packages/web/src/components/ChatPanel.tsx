import { useState, useRef, useEffect } from "react";
import type { ChatMessage } from "@internet-mindmap/shared";
import { chatStream } from "../lib/api";

export default function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const question = input.trim();
    if (!question || isStreaming) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setIsStreaming(true);

    try {
      const response = await chatStream(question);

      if (!response.ok || !response.body) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Sorry, something went wrong." },
        ]);
        setIsStreaming(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        assistantContent += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: assistantContent,
          };
          return updated;
        });
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Could not connect to the server." },
      ]);
    }

    setIsStreaming(false);
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
      <div className="p-4 border-b" style={{ borderColor: "var(--color-border)" }}>
        <h2
          className="font-[family-name:var(--font-heading)] text-base font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Ask your knowledge base
        </h2>
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

        {messages.map((msg, i) => (
          <div
            key={i}
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
                isStreaming && i === messages.length - 1 && msg.role === "assistant"
                  ? "streaming-cursor"
                  : ""
              }
            >
              {msg.content}
            </span>
          </div>
        ))}

        {isStreaming && messages[messages.length - 1]?.content === "" && (
          <div
            className="flex gap-1 px-3 py-2"
            style={{ color: "var(--color-text-muted)" }}
          >
            <span className="bounce-dot w-1.5 h-1.5 rounded-full bg-current" />
            <span className="bounce-dot w-1.5 h-1.5 rounded-full bg-current" />
            <span className="bounce-dot w-1.5 h-1.5 rounded-full bg-current" />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t" style={{ borderColor: "var(--color-border)" }}>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
            placeholder="Ask a question..."
            disabled={isStreaming}
            className="flex-1 text-sm px-3 py-2 rounded-md border transition-colors focus:outline-none"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-bg-card)",
            }}
          />
          <button
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            className="px-3 py-2 rounded-md text-sm font-medium text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            Send
          </button>
        </div>
      </div>
    </aside>
  );
}
