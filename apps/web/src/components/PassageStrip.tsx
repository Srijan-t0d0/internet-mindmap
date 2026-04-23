"use client";

import { useState } from "react";
import type { ChatPassage } from "../hooks/use-chat-session";

interface PassageStripProps {
  passages: ChatPassage[];
}

function shortChunk(id: string): string {
  // Chunk ids look like "<itemId>-c-<index>". Take just the suffix so the
  // badge stays compact while still matching the [c:<id>] cite in the text.
  const m = id.match(/-c-(\d+)$/);
  return m ? `c${m[1]}` : id.slice(0, 6);
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function PassageStrip({ passages }: PassageStripProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (passages.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      <div
        className="text-[11px] font-medium uppercase tracking-widest"
        style={{ color: "var(--color-text-muted)" }}
      >
        Passages
      </div>
      <div className="space-y-1.5">
        {passages.map((p, i) => {
          const isOpen = openIndex === i;
          return (
            <div
              key={`${p.chunkId}-${i}`}
              className="rounded-lg border overflow-hidden transition-colors duration-150"
              style={{
                borderColor: "var(--color-border-subtle)",
                backgroundColor: "var(--color-bg-card)",
              }}
            >
              <button
                onClick={() => setOpenIndex(isOpen ? null : i)}
                className="w-full text-left px-3 py-2 flex items-start gap-2.5"
              >
                <span
                  className="text-[10px] font-mono font-semibold tabular-nums mt-1 flex-shrink-0 px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: "var(--color-accent-subtle)",
                    color: "var(--color-accent)",
                  }}
                  title={`Cite as [c:${p.chunkId}]`}
                >
                  {shortChunk(p.chunkId)}
                </span>
                <div className="min-w-0 flex-1">
                  <div
                    className="text-[13px] font-medium truncate"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {p.title || getDomain(p.url)}
                  </div>
                  <div
                    className="text-[11px] mt-0.5 truncate"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {getDomain(p.url)}
                  </div>
                </div>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="flex-shrink-0 mt-1.5"
                  style={{
                    color: "var(--color-text-muted)",
                    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 150ms ease",
                  }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {isOpen && (
                <div
                  className="px-3 pb-3 pt-1 space-y-2"
                  style={{ borderTop: "1px solid var(--color-border-subtle)" }}
                >
                  <p
                    className="text-[13px] leading-relaxed italic"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    &ldquo;{p.quote}&rdquo;
                  </p>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-medium"
                    style={{ color: "var(--color-accent)" }}
                  >
                    Open source
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
