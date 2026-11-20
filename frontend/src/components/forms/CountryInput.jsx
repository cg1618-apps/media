// Frontend: a studio's Countries field - any number of countries.
//
// Free text with common options: the "Country" common option category,
// curated on the Add and Modify pages' Common Options sub-tab, offered as the
// field's typing suggestions. A country typed that is not in the list is kept
// as typed and never added to it. A publisher's single Country field reads
// the same category through a SuggestInput (PublisherAddTab.jsx).
//
// The value is comma-separated text, like every tags field's form state;
// lib/countries.js turns it into the list a save posts.
import { useCommonOptionValues } from "../../api/mutations/useCommonOptions";
import MultiSelect from "./MultiSelect";

export const COUNTRY_CATEGORY = "Country";

export default function CountryInput({ value, onChange }) {
  const { data: common } = useCommonOptionValues(COUNTRY_CATEGORY);
  return (
    <MultiSelect
      options={common ?? []}
      value={value}
      onChange={onChange}
      placeholder="Select or type countries..."
    />
  );
}
