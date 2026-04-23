"use client";

import { useState } from "react";
import type { ChatRetrievalSummary } from "../hooks/use-chat-session";

interface ConsideredDrawerProps {
  summary: ChatRetrievalSummary;
}

export default function ConsideredDrawer({ summary }: ConsideredDrawerProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(!open)}
        className="text-[11px] font-medium inline-flex items-center gap-1 transition-colors duration-150"
        style={{ color: "var(--color-text-muted)" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--color-text-secondary)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--color-text-muted)";
        }}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 150ms ease",
          }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        Considered {summary.rerankCandidates} passages, kept {summary.rerankKept}
        {" · "}
        {summary.finalItemCount} source{summary.finalItemCount === 1 ? "" : "s"}
      </button>
      {open && (
        <div
          className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] px-2 py-2 rounded-md"
          style={{
            color: "var(--color-text-muted)",
            backgroundColor: "var(--color-bg-secondary)",
          }}
        >
          <div>
            Dense candidates:{" "}
            <span style={{ color: "var(--color-text-secondary)" }}>
              {summary.denseCandidates}
            </span>
          </div>
          <div>
            FTS candidates:{" "}
            <span style={{ color: "var(--color-text-secondary)" }}>
              {summary.ftsCandidates}
            </span>
          </div>
          {summary.condensed && (
            <div className="col-span-2 pt-1 mt-1 border-t" style={{ borderColor: "var(--color-border-subtle)" }}>
              Searched as:{" "}
              <span style={{ color: "var(--color-text-secondary)" }}>
                &ldquo;{summary.condensed}&rdquo;
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
