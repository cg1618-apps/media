// Frontend: the 待補充 Needs Work note field, shared by every place a mark is
// set - the Add form, the Modify editor and the detail page's badge.
//
// The note is free text that also groups the marks on the Needs Work page.
// Two lists help the admin reuse a note rather than type a near-duplicate:
//
//   common  - the "Needs Work Note" option category, curated on the Options
//             tab. Drawn as one-click chips (clicking the pressed chip
//             clears), and offered first among the suggestions.
//   in use  - the notes marks already carry (GET /api/needs-work/notes),
//             offered after them.
//
// Rendered only for a viewer holding manage.requests: the in-use read is
// gated on it, and the callers check it before drawing this.
import {
  useNeedsWorkCommonNotes,
  useNeedsWorkNotes,
} from "../../api/mutations/useNeedsWork";
import QuickPicks from "../forms/QuickPicks";
import SuggestInput from "../forms/SuggestInput";
import { inputCls } from "../forms/FormField";

/** The suggestions: the common notes first, then the ones in use, once each. */
export function noteSuggestions(common, inUse) {
  return [...new Set([...(common ?? []), ...(inUse ?? []).map((n) => n.note)])];
}

export default function NeedsWorkNoteInput({ value, onChange }) {
  const { data: common } = useNeedsWorkCommonNotes();
  const { data: inUse } = useNeedsWorkNotes();
  return (
    <div className="flex-1 min-w-0 space-y-2">
      {common?.length > 0 && (
        <QuickPicks
          label="Common notes"
          options={common}
          value={value}
          onChange={onChange}
        />
      )}
      <SuggestInput
        aria-label="Needs Work note"
        placeholder="Note - marks with the same note are listed together"
        value={value}
        onChange={onChange}
        options={noteSuggestions(common, inUse)}
        className={inputCls}
      />
    </div>
  );
}
