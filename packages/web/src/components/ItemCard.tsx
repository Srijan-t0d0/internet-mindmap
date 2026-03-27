import type { Item } from "@internet-mindmap/shared";

const SOURCE_COLORS: Record<string, string> = {
  youtube: "var(--color-source-youtube)",
  reddit: "var(--color-source-reddit)",
  twitter: "var(--color-source-twitter)",
  blog: "var(--color-source-blog)",
  other: "var(--color-text-muted)",
};

const SOURCE_LABELS: Record<string, string> = {
  youtube: "YouTube",
  reddit: "Reddit",
  twitter: "X / Twitter",
  blog: "Blog",
  other: "Web",
};

interface ItemCardProps {
  item: Item;
  onClick: (item: Item) => void;
  onRetry?: (item: Item) => void;
  onToggleRead?: (item: Item) => void;
}

export default function ItemCard({
  item,
  onClick,
  onRetry,
  onToggleRead,
}: ItemCardProps) {
  const isProcessing = item.status === "pending" || item.status === "processing";
  const isError = item.status === "error";

  return (
    <article
      className="rounded-lg p-6 cursor-pointer transition-all duration-150 hover:-translate-y-px"
      style={{
        backgroundColor: "var(--color-bg-card)",
        boxShadow: "var(--shadow-card)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "var(--shadow-card-hover)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "var(--shadow-card)";
      }}
      onClick={() => onClick(item)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onClick(item);
      }}
    >
      {/* Source indicator + metadata */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: SOURCE_COLORS[item.source_type] }}
        />
        <span
          className="text-xs font-medium"
          style={{ color: "var(--color-text-muted)" }}
        >
          {SOURCE_LABELS[item.source_type]}
        </span>
        <span
          className="text-xs ml-auto"
          style={{ color: "var(--color-text-muted)" }}
        >
          {new Date(item.created_at).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
          })}
        </span>
        {item.is_read && (
          <span
            className="text-xs"
            style={{ color: "var(--color-text-muted)" }}
          >
            Read
          </span>
        )}
      </div>

      {/* Title */}
      <h3
        className="font-[family-name:var(--font-heading)] text-base font-semibold leading-snug mb-2 line-clamp-2"
        style={{ color: "var(--color-text-primary)" }}
      >
        {item.title}
      </h3>

      {/* Summary or skeleton */}
      {isProcessing ? (
        <div className="space-y-2">
          <div className="skeleton h-3 rounded" style={{ width: "100%" }} />
          <div className="skeleton h-3 rounded" style={{ width: "75%" }} />
        </div>
      ) : isError ? (
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: "var(--color-error)" }}>
            Processing failed{item.last_error ? `: ${item.last_error}` : ""}
          </span>
          {onRetry && (
            <button
              className="text-xs font-medium px-2 py-1 rounded border"
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
              className="text-xs font-medium px-2 py-0.5 rounded-xl border border-dashed"
              style={{
                color: "var(--color-text-secondary)",
                borderColor: "var(--color-border)",
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
          className="mt-3 text-xs font-medium"
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
