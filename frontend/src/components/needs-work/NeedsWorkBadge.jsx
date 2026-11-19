// Frontend: the 待補充 Needs Work badge on an entry's or a group's page.
//
// One component for the fifteen owner pages - the twelve media types and the
// collection, franchise and series pages - beside "Report a problem" in the
// breadcrumb row. Drawn only for a viewer holding manage.requests (super and
// the admin), the key every /api/needs-work route asks.
//
// It is where the mark is set as well as seen: a marked owner shows the red
// 待補充 chip with its note, an unmarked one a dashed "+ 待補充" chip, and
// either opens a popover holding NeedsWorkControl - the same mark-and-note
// control the Modify editor draws - plus a link to the Needs Work page.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useNeedsWorkMark } from "../../api/mutations/useNeedsWork";
import { useAuth } from "../../contexts/AuthContext";
import { Chip } from "../ui/primitives";
import NeedsWorkControl from "./NeedsWorkControl";

export default function NeedsWorkBadge({ ownerType, ownerId }) {
  const auth = useAuth();
  // Outside an AuthProvider nobody is known to hold anything.
  const canSee = Boolean(auth?.has?.("manage.requests"));
  const { data } = useNeedsWorkMark(ownerType, ownerId, { enabled: canSee });
  const [open, setOpen] = useState(false);
  const root = useRef(null);

  // Closed by a click outside it or by Escape, like the form comboboxes.
  useEffect(() => {
    if (!open) return undefined;
    function onPointer(event) {
      if (root.current && !root.current.contains(event.target)) setOpen(false);
    }
    function onKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Nothing until the mark is read: an unmarked chip that turns red a moment
  // later would read as the click having done it.
  if (!canSee || !ownerId || data === undefined) return null;

  const flagged = data.flagged === true;

  return (
    <div ref={root} className="relative shrink-0 min-w-0">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title={
          flagged
            ? data.note
              ? `待補充: ${data.note}`
              : "待補充 Needs Work"
            : "Mark as 待補充 Needs Work"
        }
        className="min-w-0 max-w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        {flagged ? (
          <Chip tone="danger" className="max-w-[16rem]">
            <span>待補充</span>
            {data.note && (
              <span className="normal-case tracking-normal truncate">· {data.note}</span>
            )}
          </Chip>
        ) : (
          <Chip dashed>+ 待補充</Chip>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="待補充 Needs Work"
          className="absolute right-0 top-full mt-2 z-30 w-[22rem] max-w-[calc(100vw-2rem)] bg-surface border border-border-strong shadow-lg p-2 space-y-2 normal-case tracking-normal"
        >
          <NeedsWorkControl ownerType={ownerType} ownerId={ownerId} />
          <Link
            to="/needs-work"
            className="block text-xs text-text-muted hover:text-brand transition"
          >
            Open the Needs Work page →
          </Link>
        </div>
      )}
    </div>
  );
}
