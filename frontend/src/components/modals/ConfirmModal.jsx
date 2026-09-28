// Frontend: modal component file for ConfirmModal.
//
// A yes/no question in the app's own modal chrome (the shape of
// CreateNewEntityModal), for the places a destructive action has to be
// confirmed. `danger` styles the confirming button as destructive. Escape
// cancels, as clicking Cancel does.
import { useEffect } from "react";

import { Button } from "../ui/primitives";

export default function ConfirmModal({
  title,
  children,
  confirmLabel = "Confirm",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        className="bg-surface border border-border shadow-xl max-w-md w-full mx-4 overflow-hidden"
      >
        <div className="px-6 py-3 border-b border-border">
          <h3
            id="confirm-modal-title"
            className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted"
          >
            {title}
          </h3>
        </div>
        <div className="px-6 py-5 text-sm text-text-muted">{children}</div>
        <div className="px-6 py-3 border-t border-border flex gap-2 justify-end">
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            kind={danger ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={busy}
            autoFocus
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
