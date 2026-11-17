// Frontend: modal component file for FranchiseCreateModal.
//
// Confirms the quick-create of a franchise from an entry's names before the
// entry is saved, so a new franchise is never minted without a yes. It asks
// nothing else: an expectation is the
// viewer's own, set on the franchise's page, and a 備註 Remark is added in the
// franchise's Notes card once it exists.
import { Button } from "../ui/primitives";

export default function FranchiseCreateModal({
  onConfirm,
  onCancel,
  franchiseType = "Anime",
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        role="dialog"
        aria-modal="true"
        className="bg-surface border border-border shadow-xl max-w-md w-full mx-4 overflow-hidden"
      >
        <div className="px-6 py-3 border-b border-border">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
            Create new franchise
          </h3>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm text-text-muted">
            A new franchise will be created using the names you filled in,
            with type set to{" "}
            <span className="font-semibold text-text">{franchiseType}</span>.
          </p>
        </div>
        <div className="px-6 py-3 border-t border-border flex gap-2 justify-end">
          <Button onClick={onCancel}>Cancel</Button>
          <Button kind="primary" onClick={() => onConfirm()}>
            Create and proceed
          </Button>
        </div>
      </div>
    </div>
  );
}
