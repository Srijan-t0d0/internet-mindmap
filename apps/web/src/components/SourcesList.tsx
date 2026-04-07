"use client";

import { useState } from "react";
import type { SourceUrlUIPart } from "ai";

interface SourcesListProps {
  sources: SourceUrlUIPart[];
  compact?: boolean;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function SourcesList({ sources, compact = false }: SourcesListProps) {
  const [expanded, setExpanded] = useState(false);

  if (sources.length === 0) return null;

  const visibleSources = expanded ? sources : sources.slice(0, 3);
  const hasMore = sources.length > 3;

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1.5 mt-2">
        {sources.map((source, i) => (
          <a
            key={source.sourceId}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full transition-colors duration-150"
            style={{
              backgroundColor: "var(--color-bg-secondary)",
              color: "var(--color-text-muted)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--color-accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--color-text-muted)";
            }}
            title={source.title || source.url}
          >
            <span className="font-medium">[{i + 1}]</span>
            <span className="truncate max-w-[120px]">
              {source.title || getDomain(source.url)}
            </span>
          </a>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs font-medium mb-2 transition-colors duration-150"
        style={{ color: "var(--color-text-muted)" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--color-text-secondary)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--color-text-muted)";
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
        </svg>
        Sources ({sources.length})
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
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 150ms ease",
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {visibleSources.map((source, i) => (
            <a
              key={source.sourceId}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg border transition-all duration-150 group"
              style={{
                borderColor: "var(--color-border-subtle)",
                backgroundColor: "var(--color-bg-card)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--color-accent)";
                e.currentTarget.style.backgroundColor = "var(--color-bg-secondary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border-subtle)";
                e.currentTarget.style.backgroundColor = "var(--color-bg-card)";
              }}
            >
              <span
                className="text-[11px] font-semibold tabular-nums mt-0.5 flex-shrink-0"
                style={{ color: "var(--color-accent)" }}
              >
                [{i + 1}]
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className="text-sm font-medium truncate"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {source.title || getDomain(source.url)}
                </p>
                <p
                  className="text-[11px] truncate mt-0.5"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {getDomain(source.url)}
                </p>
              </div>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: "var(--color-text-muted)" }}
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          ))}
        </div>
      )}

      {!expanded && hasMore && (
        <button
          onClick={() => setExpanded(true)}
          className="text-xs mt-1"
          style={{ color: "var(--color-accent)" }}
        >
          Show {sources.length - 3} more
        </button>
      )}
    </div>
  );
}
