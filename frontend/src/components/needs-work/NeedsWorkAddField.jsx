// Frontend: mark a record as 待補充 Needs Work while adding it.
//
// The Add form's counterpart of NeedsWorkControl. The record has no id yet,
// so nothing is written here: the field is controlled - `value` is
// `{ flagged, note }`, held by the Add page beside its content labels - and
// the page PUTs the mark once the create has answered with the new id.
//
// Drawn only for a viewer holding manage.requests, the key the PUT asks, so
// nobody is offered a mark the save would then refuse.
import { useAuth } from "../../contexts/AuthContext";
import NeedsWorkNoteInput from "./NeedsWorkNoteInput";

/** The field's state when nothing is marked; also what a save resets it to. */
export const EMPTY_NEEDS_WORK = { flagged: false, note: "" };

export default function NeedsWorkAddField({ value, onChange }) {
  const auth = useAuth();
  if (!auth?.has?.("manage.requests")) return null;

  return (
    <div
      data-testid="needs-work-add-field"
      className="border border-dashed border-border-strong px-3 py-2 space-y-2"
    >
      <label className="flex items-center gap-2 text-sm font-bold text-text">
        <input
          type="checkbox"
          checked={value.flagged}
          onChange={(e) =>
            onChange(e.target.checked ? { ...value, flagged: true } : EMPTY_NEEDS_WORK)
          }
        />
        待補充 Needs Work
        <span className="text-xs font-normal text-text-faint">
          the data is not complete yet - marked when the record is saved
        </span>
      </label>
      {value.flagged && (
        <NeedsWorkNoteInput
          value={value.note}
          onChange={(note) => onChange({ ...value, note })}
        />
      )}
    </div>
  );
}
