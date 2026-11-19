// Frontend: mark an entry or a group as 待補充 Needs Work, from its editor.
//
// Sits in the Modify page's editor header, the one place every owner type -
// the twelve media types and the three grouping tiers - is edited, so one
// call site covers all fifteen. It saves on its own rather than with the
// editor's Save: the mark is its own row (needs_work), not a column of the
// entry, so toggling it neither needs nor disturbs the rest of the form.
//
// Drawn only for a viewer holding manage.requests, the key every
// /api/needs-work route asks. The note is free text that also groups the
// marks on the Needs Work page, so it offers the notes already in use.
import { useState } from "react";

import {
  useClearNeedsWork,
  useNeedsWorkMark,
  useNeedsWorkNotes,
  useSetNeedsWork,
} from "../../api/mutations/useNeedsWork";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
import SuggestInput from "../forms/SuggestInput";
import { inputCls } from "../forms/FormField";
import { Button } from "../ui/primitives";

export default function NeedsWorkControl({ ownerType, ownerId }) {
  const auth = useAuth();
  const { showToast } = useToast();
  const canMark = Boolean(auth?.has?.("manage.requests"));
  const { data: mark } = useNeedsWorkMark(ownerType, ownerId, { enabled: canMark });
  const flagged = mark?.flagged === true;
  const { data: notes } = useNeedsWorkNotes({ enabled: canMark && flagged });
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
          options={(notes ?? []).map((n) => n.note)}
          busy={busy}
          onSave={(note) =>
            run(setMark.mutateAsync({ ownerType, ownerId, note }), "Note saved")
          }
        />
      )}
    </div>
  );
}

function NoteField({ stored, options, busy, onSave }) {
  const [note, setNote] = useState(stored ?? "");
  const changed = (note.trim() || null) !== (stored ?? null);
  return (
    <div className="flex items-center gap-2">
      <SuggestInput
        aria-label="Needs Work note"
        placeholder="Note - marks with the same note are listed together"
        value={note}
        onChange={setNote}
        options={options}
        className={inputCls}
      />
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
