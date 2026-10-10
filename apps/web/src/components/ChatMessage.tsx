"use client";

import React, { memo } from "react";
import type { UIMessage } from "ai";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import SourcesList from "./SourcesList";
import PassageStrip from "./PassageStrip";
import ConsideredDrawer from "./ConsideredDrawer";
import FollowupChips from "./FollowupChips";
import {
  getMessageText, getMessageSources, getMessagePassages,
  getMessageRetrieval, getMessageFollowups, type ChatPassage,
} from "../hooks/use-chat-session";

function shortChunkLabel(id: string): string {
  const m = id.match(/-c-(\d+)$/);
  return m ? `c${m[1]}` : id.slice(0, 6);
}

export function preprocessCitations(text: string, passages: ChatPassage[]): string {
  return text
    .replace(/\[c:([\w-]+)\]/g, (_m, id) => `[${shortChunkLabel(id)}](#cite-c-${id})`)
    .replace(/\[i:([\w-]+)\]/g, (_m, id) => {
      const match = passages.find((p) => p.itemId === id);
      return `[${match ? shortChunkLabel(match.chunkId) : "src"}](#cite-i-${id})`;
    });
}

export const citationComponents: Components = {
  a({ href, children, ...rest }) {
    if (typeof href === "string" && href.startsWith("#cite-")) {
      return (
        <a
          href={href}
          onClick={(e) => {
            e.preventDefault();
            const targetId = href.slice(1);
            let el = document.getElementById(targetId);
            if (!el && targetId.startsWith("cite-i-")) {
              el = document.querySelector(`[data-cite-item="${CSS.escape(targetId.slice("cite-i-".length))}"]`);
            }
            if (el) {
              el.scrollIntoView({
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
                block: "center",
              });
              el.classList.add("citation-flash");
              const target = el;
              setTimeout(() => target.classList.remove("citation-flash"), 1200);
            }
          }}
          className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded text-[10px] font-mono font-semibold tabular-nums align-baseline no-underline"
          style={{ backgroundColor: "var(--color-accent-subtle)", color: "var(--color-accent)", verticalAlign: "baseline", lineHeight: 1.2 }}
          title="Jump to source"
        >
          {children}
        </a>
      );
    }
    return <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>{children}</a>;
  },
};
const markdownPlugins = [remarkGfm];

// Stable message objects from useChat let completed rows skip Markdown parsing.
const ChatMessage = memo(function ChatMessage({ message, isStreaming, onPick }: {
  message: UIMessage;
  isStreaming: boolean;
  onPick: (text: string) => void;
}) {
  const text = getMessageText(message);
  const isUser = message.role === "user";
  const sources = isUser ? [] : getMessageSources(message);
  const passages = isUser ? [] : getMessagePassages(message);
  const retrieval = isUser ? null : getMessageRetrieval(message);
  const followups = isUser ? [] : getMessageFollowups(message);
  return (
    <div className={isUser ? "flex justify-end" : "flex gap-3"}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-1" style={{ backgroundColor: "var(--color-bg-tertiary)" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-text-muted)" }}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
      )}
      <div className="min-w-0" style={isUser ? { maxWidth: "80%" } : { flex: 1 }}>
        <div className="text-[15px] leading-relaxed px-4 py-3" style={{
          backgroundColor: isUser ? "var(--color-accent)" : "var(--color-bg-secondary)",
          color: isUser ? "#ffffff" : "var(--color-text-primary)",
          borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
        }}>
          {isUser ? text : (
            <div className={`chat-markdown ${isStreaming ? "streaming-cursor" : ""}`}>
              <ReactMarkdown remarkPlugins={markdownPlugins} components={citationComponents}>
                {preprocessCitations(text, passages)}
              </ReactMarkdown>
            </div>
          )}
        </div>
        {!isUser && passages.length > 0 && <PassageStrip passages={passages} />}
        {!isUser && passages.length === 0 && sources.length > 0 && <SourcesList sources={sources} />}
        {!isUser && retrieval && !isStreaming && <ConsideredDrawer summary={retrieval} />}
        {!isUser && followups.length > 0 && <FollowupChips questions={followups} onPick={onPick} />}
      </div>
    </div>
  );
});
export default ChatMessage;
