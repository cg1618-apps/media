// The Tier 2 category picker on the admin Add, Modify and Delete pages.
//
// A closed picker, not a text box: the categories are a fixed vocabulary
// declared in app/utils/credit_roles.py, so the Add page offers the same list
// the other two browse rather than letting one be invented at the keyboard.
// The API still accepts any category string - this is a UI restriction.
//
// The sections come from lib/optionsPageGroups.js, the same arrangement the
// /options page reads these categories in, so an admin who knows where Comic
// Era sits on one page finds it in the same company on the others.
import { groupTier2Categories } from "../../lib/optionsPageGroups";

import { selectCls } from "./FormField";

export default function OptionCategorySelect({
  categories,
  value,
  onChange,
  placeholder = "— Choose a category —",
  className = selectCls,
}) {
  const sections = groupTier2Categories(categories);
  // A list that yields one section - a filtered or near-empty picker - gets no
  // heading: one heading over every option says nothing the list does not.
  // Every sub-tab's full list spans several sections (the Tags sub-tab reads
  // as Tags, Game, H Genre and Character), so each is rendered in optgroups.
  const grouped = sections.length > 1;
  return (
    <select className={className} value={value} onChange={onChange}>
      <option value="">{placeholder}</option>
      {grouped
        ? sections.map((section) => (
            <optgroup key={section.title} label={section.title}>
              {section.categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </optgroup>
          ))
        : sections
            .flatMap((section) => section.categories)
            .map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
    </select>
  );
}
