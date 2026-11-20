// Frontend: a studio's Countries field - any number of countries.
//
// Free text with common options: the "Country" common option category,
// curated on the Add and Modify pages' Common Options sub-tab, drawn as
// one-click toggle chips (a click adds the country, a second takes it out)
// and offered in the field's suggestions. A country typed that is not in the
// list is kept as typed and never added to it - the same shape as the 待補充
// note's field (components/needs-work/NeedsWorkNoteInput.jsx).
//
// The value is comma-separated text, like every tags field's form state;
// lib/countries.js turns it into the list a save posts.
import { useCommonOptionValues } from "../../api/mutations/useCommonOptions";
import { countriesToForm, splitCountries } from "../../lib/countries";
import MultiSelect from "./MultiSelect";
import QuickPicks from "./QuickPicks";

export const COUNTRY_CATEGORY = "Country";

export default function CountryInput({ value, onChange }) {
  const { data: common } = useCommonOptionValues(COUNTRY_CATEGORY);
  return (
    <div className="space-y-2">
      {common?.length > 0 && (
        <QuickPicks
          multiple
          label="Common countries"
          options={common}
          value={splitCountries(value)}
          onChange={(names) => onChange(countriesToForm(names))}
        />
      )}
      <MultiSelect
        options={common ?? []}
        value={value}
        onChange={onChange}
        placeholder="Select or type countries..."
      />
    </div>
  );
}
