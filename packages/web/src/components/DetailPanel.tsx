import { useState } from "react";
import type { Item } from "@internet-mindmap/shared";
import { SOURCE_CSS_COLORS } from "../lib/constants";
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
      className="w-[480px] h-screen flex-shrink-0 flex flex-col border-l overflow-y-auto"
      style={{
        backgroundColor: "var(--color-bg-card)",
        borderColor: "var(--color-border)",
        boxShadow: "var(--shadow-panel)",
      }}
    >
      <div
        className="sticky top-0 p-6 border-b flex items-start justify-between gap-4"
        style={{
          backgroundColor: "var(--color-bg-card)",
          borderColor: "var(--color-border)",
        }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: SOURCE_CSS_COLORS[item.source_type] }}
            />
            <span
              className="text-xs font-medium"
              style={{ color: "var(--color-text-muted)" }}
            >
              {item.source_type}
            </span>
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
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
          className="text-lg p-1 rounded-md hover:bg-bg-secondary transition-colors flex-shrink-0"
          style={{ color: "var(--color-text-muted)" }}
          aria-label="Close detail panel"
        >
          ×
        </button>
      </div>

      <div className="p-6 space-y-6">
        <div className="flex gap-2">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium px-3 py-1.5 rounded-md text-white transition-colors"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            Open original
          </a>
          <button
            onClick={() => onToggleRead(item)}
            className="text-sm font-medium px-3 py-1.5 rounded-md border transition-colors"
            style={{
              color: "var(--color-text-secondary)",
              borderColor: "var(--color-border)",
            }}
          >
            {item.is_read ? "Mark unread" : "Mark as read"}
          </button>
          <button
            onClick={() => setShowDeleteDialog(true)}
            className="text-sm font-medium px-3 py-1.5 rounded-md border transition-colors ml-auto"
            style={{
              color: "var(--color-error)",
              borderColor: "var(--color-error)",
            }}
          >
            Delete
          </button>
        </div>

        {item.summary && (
          <div>
            <h3
              className="text-xs font-medium uppercase tracking-wider mb-2"
              style={{ color: "var(--color-text-muted)" }}
            >
              Summary
            </h3>
            <p
              className="text-sm leading-relaxed"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {item.summary}
            </p>
          </div>
        )}

        {item.key_passages && item.key_passages.length > 0 && (
          <div>
            <h3
              className="text-xs font-medium uppercase tracking-wider mb-2"
              style={{ color: "var(--color-text-muted)" }}
            >
              Key Passages
            </h3>
            <div className="space-y-2">
              {item.key_passages.map((passage, i) => (
                <blockquote
                  key={i}
                  className="text-sm leading-relaxed pl-3 border-l-2"
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
              className="text-xs font-medium uppercase tracking-wider mb-2"
              style={{ color: "var(--color-text-muted)" }}
            >
              Tags
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {item.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs font-medium px-2.5 py-1 rounded-xl border border-dashed"
                  style={{
                    color: "var(--color-text-secondary)",
                    borderColor: "var(--color-border)",
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
            className="text-xs font-medium uppercase tracking-wider mb-2"
            style={{ color: "var(--color-text-muted)" }}
          >
            Source
          </h3>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm break-all"
            style={{ color: "var(--color-accent)" }}
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
            backgroundColor: "rgba(217, 79, 79, 0.08)",
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
