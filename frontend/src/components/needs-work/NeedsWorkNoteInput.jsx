// Frontend: the 待補充 Needs Work note field, shared by every place a mark's
// note is written - the Add form, the Modify editor, the detail page's badge
// and the Needs Work page's note editor.
//
// The note is free text that also groups the marks on the Needs Work page.
// Its suggestions are the "Needs Work Note" common option category and
// nothing else, curated on the Add and Modify pages' Common Options sub-tab:
// drawn as one-click chips (clicking the pressed chip clears) and offered in
// the field's suggestions. A note typed that is not in the list is stored as
// typed and never added to it.
//
// Rendered only for a viewer holding manage.requests: the callers check it
// before drawing this.
import { useNeedsWorkCommonNotes } from "../../api/mutations/useNeedsWork";
import QuickPicks from "../forms/QuickPicks";
import SuggestInput from "../forms/SuggestInput";
import { inputCls } from "../forms/FormField";

// `id` is for a caller that labels the field with its own <label htmlFor>;
// without one, the field names itself.
export default function NeedsWorkNoteInput({ value, onChange, id }) {
  const { data: common } = useNeedsWorkCommonNotes();
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
        id={id}
        aria-label={id ? undefined : "Needs Work note"}
        placeholder="Note - marks with a common note are listed together"
        value={value}
        onChange={onChange}
        options={common ?? []}
        className={inputCls}
      />
    </div>
  );
}
