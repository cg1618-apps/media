// Frontend: modal component file for OnceLinkModal.
//
// Shows a one-time link the server has just minted - a password reset link
// today - with a copy button and its expiry. The server stores only a hash,
// so this is the one time the link exists anywhere it can be read: the modal
// says so, and closing it is the end of it. Same chrome as ConfirmModal;
// Escape closes, as the Close button does.
import { useEffect, useState } from "react";

import { Button } from "../ui/primitives";
import { copyTextToClipboard } from "../../lib/clipboardImage";

function formatExpiry(iso) {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function OnceLinkModal({ title, link, expiresAt, children, onClose }) {
  const [copied, setCopied] = useState("");

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copy() {
    const result = await copyTextToClipboard(link);
    setCopied(result.ok ? "Copied." : result.error);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="once-link-modal-title"
        className="bg-surface border border-border shadow-xl max-w-lg w-full mx-4 overflow-hidden"
      >
        <div className="px-6 py-3 border-b border-border">
          <h3
            id="once-link-modal-title"
            className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted"
          >
            {title}
          </h3>
        </div>
        <div className="px-6 py-5 text-sm text-text-muted space-y-3">
          {children}
          <input
            readOnly
            aria-label="Link"
            value={link}
            onFocus={(e) => e.target.select()}
            className="w-full px-3 py-2 border border-border-strong bg-surface-2 font-mono text-xs text-text"
          />
          <p className="font-mono text-[11px] text-text-faint">
            Expires {formatExpiry(expiresAt)}
          </p>
          <p className="text-text">
            This link is shown only once. Copy it before you close this window.
          </p>
          {copied && (
            <p role="status" className="text-xs text-text-faint">
              {copied}
            </p>
          )}
        </div>
        <div className="px-6 py-3 border-t border-border flex gap-2 justify-end">
          <Button onClick={onClose}>Close</Button>
          <Button kind="primary" onClick={copy} autoFocus>
            Copy link
          </Button>
        </div>
      </div>
    </div>
  );
}
