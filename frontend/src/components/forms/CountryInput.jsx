// Frontend: a studio's Country field.
//
// Free text with common options: the "Country" common option category,
// curated on the Add and Modify pages' Common Options sub-tab, drawn as
// one-click chips (clicking the picked chip clears) and offered in the
// field's suggestions. A country typed that is not in the list is stored as
// typed and never added to it - the same shape as the 待補充 note's field
// (components/needs-work/NeedsWorkNoteInput.jsx).
import { useCommonOptionValues } from "../../api/mutations/useCommonOptions";
import QuickPicks from "./QuickPicks";
import SuggestInput from "./SuggestInput";
import { inputCls } from "./FormField";

export const COUNTRY_CATEGORY = "Country";

export default function CountryInput({ value, onChange }) {
  const { data: common } = useCommonOptionValues(COUNTRY_CATEGORY);
  return (
    <div className="space-y-2">
      {common?.length > 0 && (
        <QuickPicks
          label="Common countries"
          options={common}
          value={value}
          onChange={onChange}
        />
      )}
      <SuggestInput
        aria-label="Country"
        value={value}
        onChange={onChange}
        options={common ?? []}
        className={inputCls}
      />
    </div>
  );
}
