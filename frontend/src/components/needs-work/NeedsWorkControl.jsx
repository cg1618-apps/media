// Frontend: mark a saved entry or group as 待補充 Needs Work.
//
// Drawn in the Modify page's editor header and in the detail page's badge
// popover (NeedsWorkBadge), for all fifteen owner types - the twelve media
// types and the three grouping tiers. It saves on its own rather than with
// the editor's Save: the mark is its own row (needs_work), not a column of
// the entry, so toggling it neither needs nor disturbs the rest of the form.
// A record not saved yet is marked from the Add form instead
// (NeedsWorkAddField), which saves the mark after the create.
//
// Drawn only for a viewer holding manage.requests, the key every
// /api/needs-work route asks. The note field is NeedsWorkNoteInput: the
// common notes as chips, and those plus the notes in use as suggestions.
import { useState } from "react";

import {
  useClearNeedsWork,
  useNeedsWorkMark,
  useSetNeedsWork,
} from "../../api/mutations/useNeedsWork";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
import { Button } from "../ui/primitives";
import NeedsWorkNoteInput from "./NeedsWorkNoteInput";

export default function NeedsWorkControl({ ownerType, ownerId }) {
  const auth = useAuth();
  const { showToast } = useToast();
  const canMark = Boolean(auth?.has?.("manage.requests"));
  const { data: mark } = useNeedsWorkMark(ownerType, ownerId, { enabled: canMark });
  const flagged = mark?.flagged === true;
  const setMark = useSetNeedsWork();
  const clearMark = useClearNeedsWork();

  if (!canMark || !ownerId) return null;

  const busy = setMark.isPending || clearMark.isPending;

  async function run(promise, done) {
    try {
      await promise;
      showToast("success", done);
    } catch (err) {
      showToast("error", err.message || "Could not save the mark");
    }
  }

  function toggle(event) {
    if (event.target.checked) {
      run(setMark.mutateAsync({ ownerType, ownerId, note: null }), "Marked 待補充");
    } else {
      run(clearMark.mutateAsync({ ownerType, ownerId }), "Mark cleared");
    }
  }

  return (
    <div
      data-testid="needs-work-control"
      className="border border-dashed border-border-strong px-3 py-2 space-y-2"
    >
      <label className="flex items-center gap-2 text-sm font-bold text-text">
        <input
          type="checkbox"
          checked={flagged}
          disabled={busy || mark === undefined}
          onChange={toggle}
        />
        待補充 Needs Work
        <span className="text-xs font-normal text-text-faint">
          the data is not complete yet
        </span>
      </label>
      {flagged && (
        // Keyed by the stored note, so the field starts from it again
        // whenever a read or a save brings a different one.
        <NoteField
          key={`${ownerId}:${mark.note ?? ""}`}
          stored={mark.note}
          busy={busy}
          onSave={(note) =>
            run(setMark.mutateAsync({ ownerType, ownerId, note }), "Note saved")
          }
        />
      )}
    </div>
  );
}

function NoteField({ stored, busy, onSave }) {
  const [note, setNote] = useState(stored ?? "");
  const changed = (note.trim() || null) !== (stored ?? null);
  return (
    <div className="flex items-end gap-2">
      <NeedsWorkNoteInput value={note} onChange={setNote} />
      <Button
        type="button"
        size="sm"
        disabled={busy || !changed}
        onClick={() => onSave(note)}
      >
        Save note
      </Button>
    </div>
  );
}
