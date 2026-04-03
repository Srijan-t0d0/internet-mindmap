import { useRef, useEffect } from "react";

interface AlertDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
}

export default function AlertDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  loading = false,
}: AlertDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="rounded-xl p-0 max-w-sm w-full backdrop:bg-black/25 backdrop:backdrop-blur-sm"
      style={{
        backgroundColor: "var(--color-bg-card)",
        border: "1px solid var(--color-border)",
        boxShadow: "0 16px 48px rgba(0, 0, 0, 0.12)",
      }}
    >
      <div className="p-6">
        <h3
          className="font-[family-name:var(--font-heading)] text-lg font-semibold mb-2"
          style={{ color: "var(--color-text-primary)" }}
        >
          {title}
        </h3>
        <p
          className="text-sm leading-relaxed"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {description}
        </p>
      </div>
      <div className="flex justify-end gap-2 px-6 pb-6">
        <button
          onClick={onClose}
          disabled={loading}
          className="text-sm font-medium px-4 py-2 rounded-md border transition-all duration-150 disabled:opacity-50 hover:scale-[0.98] active:scale-[0.96]"
          style={{
            color: "var(--color-text-secondary)",
            borderColor: "var(--color-border)",
          }}
        >
          {cancelLabel}
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="text-sm font-medium px-4 py-2 rounded-md text-white transition-all duration-150 disabled:opacity-50 hover:scale-[0.98] active:scale-[0.96]"
          style={{ backgroundColor: "var(--color-error)" }}
        >
          {loading ? "Deleting..." : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
