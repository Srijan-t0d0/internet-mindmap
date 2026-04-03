import { useState } from "react";
import type { Item } from "@internet-mindmap/shared";
import { SOURCE_CSS_COLORS, SOURCE_LABELS } from "../lib/constants";
import AlertDialog from "./ui/AlertDialog";

interface DetailPanelProps {
  item: Item;
  onClose: () => void;
  onToggleRead: (item: Item) => void;
  onDelete: (item: Item) => void;
}

export default function DetailPanel({ item, onClose, onToggleRead, onDelete }: DetailPanelProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleConfirmDelete() {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(item);
    } catch {
      setDeleteError("Failed to delete item. Try again.");
      setIsDeleting(false);
    }
  }

  return (
    <aside
      className="w-[480px] h-screen flex-shrink-0 flex flex-col border-l overflow-y-auto panel-slide-in"
      style={{
        backgroundColor: "var(--color-bg-card)",
        borderColor: "var(--color-border)",
        boxShadow: "var(--shadow-panel)",
      }}
    >
      <div
        className="sticky top-0 p-6 border-b flex items-start justify-between gap-4 z-10"
        style={{
          backgroundColor: "var(--color-bg-card)",
          borderColor: "var(--color-border)",
        }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: SOURCE_CSS_COLORS[item.source_type] }}
            />
            <span
              className="text-[11px] font-medium uppercase tracking-wide"
              style={{ color: "var(--color-text-muted)" }}
            >
              {SOURCE_LABELS[item.source_type]}
            </span>
            <span
              className="text-[11px] tabular-nums"
              style={{ color: "var(--color-text-muted)" }}
            >
              {new Date(item.created_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>
          <h2
            className="font-[family-name:var(--font-heading)] text-lg font-semibold leading-snug"
            style={{ color: "var(--color-text-primary)" }}
          >
            {item.title}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-md transition-colors duration-150 flex-shrink-0"
          style={{ color: "var(--color-text-muted)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--color-bg-secondary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
          aria-label="Close detail panel"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="p-6 space-y-6">
        <div className="flex gap-2 flex-wrap">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium px-4 py-2 rounded-md text-white transition-all duration-150 hover:scale-[0.98] active:scale-[0.96] inline-flex items-center gap-1.5"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            Open original
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
          <button
            onClick={() => onToggleRead(item)}
            className="text-sm font-medium px-4 py-2 rounded-md border transition-all duration-150 hover:scale-[0.98] active:scale-[0.96]"
            style={{
              color: "var(--color-text-secondary)",
              borderColor: "var(--color-border)",
            }}
          >
            {item.is_read ? "Mark unread" : "Mark as read"}
          </button>
          <button
            onClick={() => setShowDeleteDialog(true)}
            className="text-sm font-medium px-4 py-2 rounded-md border transition-all duration-150 hover:scale-[0.98] active:scale-[0.96] ml-auto"
            style={{
              color: "var(--color-error)",
              borderColor: "var(--color-border)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--color-error)";
              e.currentTarget.style.backgroundColor = "rgba(217, 79, 79, 0.04)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--color-border)";
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            Delete
          </button>
        </div>

        {item.summary && (
          <div>
            <h3
              className="text-[11px] font-medium uppercase tracking-widest mb-3"
              style={{ color: "var(--color-text-muted)" }}
            >
              Summary
            </h3>
            <p
              className="text-sm leading-[1.7]"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {item.summary}
            </p>
          </div>
        )}

        {item.key_passages && item.key_passages.length > 0 && (
          <div>
            <h3
              className="text-[11px] font-medium uppercase tracking-widest mb-3"
              style={{ color: "var(--color-text-muted)" }}
            >
              Key Passages
            </h3>
            <div className="space-y-3">
              {item.key_passages.map((passage, i) => (
                <blockquote
                  key={i}
                  className="text-sm leading-[1.7] pl-4 border-l-2"
                  style={{
                    color: "var(--color-text-secondary)",
                    borderColor: "var(--color-accent)",
                  }}
                >
                  {passage}
                </blockquote>
              ))}
            </div>
          </div>
        )}

        {item.tags && item.tags.length > 0 && (
          <div>
            <h3
              className="text-[11px] font-medium uppercase tracking-widest mb-3"
              style={{ color: "var(--color-text-muted)" }}
            >
              Tags
            </h3>
            <div className="flex flex-wrap gap-2">
              {item.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs font-medium px-2.5 py-1 rounded-full"
                  style={{
                    color: "var(--color-text-secondary)",
                    backgroundColor: "var(--color-bg-secondary)",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        <div>
          <h3
            className="text-[11px] font-medium uppercase tracking-widest mb-3"
            style={{ color: "var(--color-text-muted)" }}
          >
            Source
          </h3>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm break-all leading-relaxed transition-colors duration-150"
            style={{ color: "var(--color-accent)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--color-accent-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--color-accent)";
            }}
          >
            {item.url}
          </a>
        </div>
      </div>

      {deleteError && (
        <div
          className="mx-6 mb-4 text-sm px-3 py-2 rounded-md"
          style={{
            color: "var(--color-error)",
            backgroundColor: "rgba(217, 79, 79, 0.06)",
          }}
        >
          {deleteError}
        </div>
      )}

      <AlertDialog
        open={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setDeleteError(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Delete this item?"
        description="This cannot be undone. The item will be permanently removed from your knowledge base."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        loading={isDeleting}
      />
    </aside>
  );
}
