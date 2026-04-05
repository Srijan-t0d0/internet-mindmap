"use client";

import type { Item } from "@internet-mindmap/shared";
import { SOURCE_CSS_COLORS, SOURCE_LABELS } from "@internet-mindmap/ui";

interface ItemCardProps {
  item: Item;
  onClick: (item: Item) => void;
  onRetry?: (item: Item) => void;
  onToggleRead?: (item: Item) => void;
  style?: React.CSSProperties;
  className?: string;
}

export default function ItemCard({
  item,
  onClick,
  onRetry,
  onToggleRead,
  style,
  className,
}: ItemCardProps) {
  const isProcessing = item.status === "pending" || item.status === "processing";
  const isError = item.status === "error";

  return (
    <article
      className={`rounded-lg p-6 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 group ${className || ""}`}
      style={{
        backgroundColor: "var(--color-bg-card)",
        boxShadow: "var(--shadow-card)",
        border: "1px solid var(--color-border-subtle)",
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "var(--shadow-card-hover)";
        e.currentTarget.style.borderColor = "var(--color-border)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "var(--shadow-card)";
        e.currentTarget.style.borderColor = "var(--color-border-subtle)";
      }}
      onClick={() => onClick(item)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onClick(item);
      }}
    >
      {/* Source indicator + metadata */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: SOURCE_CSS_COLORS[item.source_type] }}
        />
        <span
          className="text-[11px] font-medium uppercase tracking-wide"
          style={{ color: "var(--color-text-muted)" }}
        >
          {SOURCE_LABELS[item.source_type]}
        </span>
        <span className="flex-1" />
        <span
          className="text-[11px] tabular-nums"
          style={{ color: "var(--color-text-muted)" }}
        >
          {new Date(item.created_at).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
          })}
        </span>
        {item.is_read && (
          <span
            className="text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded"
            style={{
              color: "var(--color-success)",
              backgroundColor: "rgba(74, 158, 107, 0.08)",
            }}
          >
            Read
          </span>
        )}
      </div>

      {/* Title */}
      <h3
        className="font-[family-name:var(--font-heading)] text-[15px] font-semibold leading-snug mb-1 line-clamp-2 transition-colors duration-150 group-hover:text-[var(--color-accent-hover)]"
        style={{ color: "var(--color-text-primary)" }}
      >
        {item.title}
      </h3>

      {/* Author / site byline */}
      {(item.author || item.site_name) && (
        <p
          className="text-[12px] leading-tight mb-2 truncate"
          style={{ color: "var(--color-text-muted)" }}
        >
          {item.author}
          {item.author && item.site_name && (
            <span style={{ color: "var(--color-border)" }}>{" \u00b7 "}</span>
          )}
          {item.site_name}
        </p>
      )}

      {/* Summary or skeleton */}
      {isProcessing ? (
        <div className="space-y-2 mt-3">
          <div className="skeleton h-3 rounded-sm" style={{ width: "100%" }} />
          <div className="skeleton h-3 rounded-sm" style={{ width: "75%" }} />
        </div>
      ) : isError ? (
        <div className="flex items-center gap-2 mt-1">
          <span
            className="text-xs leading-relaxed"
            style={{ color: "var(--color-error)" }}
          >
            Processing failed{item.last_error ? `: ${item.last_error}` : ""}
          </span>
          {onRetry && (
            <button
              className="text-xs font-medium px-2.5 py-1 rounded-md border transition-all duration-150 hover:scale-[0.98] active:scale-[0.96]"
              style={{
                color: "var(--color-accent)",
                borderColor: "var(--color-accent)",
              }}
              onClick={(e) => {
                e.stopPropagation();
                onRetry(item);
              }}
            >
              Retry
            </button>
          )}
        </div>
      ) : (
        <p
          className="text-sm leading-relaxed line-clamp-3 mb-3"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {item.summary}
        </p>
      )}

      {/* Tags */}
      {item.tags && item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {item.tags.map((tag) => (
            <span
              key={tag}
              className="text-[11px] font-medium px-2 py-0.5 rounded-full"
              style={{
                color: "var(--color-text-secondary)",
                backgroundColor: "var(--color-bg-secondary)",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Read/unread toggle */}
      {!isProcessing && !isError && onToggleRead && (
        <button
          className="mt-3 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          style={{ color: "var(--color-accent)" }}
          onClick={(e) => {
            e.stopPropagation();
            onToggleRead(item);
          }}
        >
          {item.is_read ? "Mark unread" : "Mark as read"}
        </button>
      )}
    </article>
  );
}
