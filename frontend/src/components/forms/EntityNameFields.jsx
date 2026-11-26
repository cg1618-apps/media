// Frontend: the four name inputs of an entity form - studio, publisher,
// person, character and identity, on Add and Modify alike.
//
// One layout for every entity: CN beside EN on the first row, JP beside Alt
// on the second. The rows are fixed here rather than read from the order of
// `fields`, because that order (STUDIO_NAME_FIELDS: en, cn, jp, alt) is the
// display-name fallback chain, mirrored by the backend's display_name, and
// must not move for the sake of a layout. Each input is labelled
// "Name (<label>)", the label doubling as its accessible name.
import { STUDIO_NAME_FIELDS } from "../../lib/naming";
import { Field, inputCls } from "./FormField";

const ROWS = [
  ["cn", "en"],
  ["jp", "alt"],
];

/**
 * `form` and `update(field, value)` are the tab's own form state and setter;
 * `fields` is the entity's name-field list, `{key, label, field}` per name
 * (STUDIO_NAME_FIELDS, which every entity shares).
 */
export default function EntityNameFields({ form, update, fields = STUDIO_NAME_FIELDS }) {
  const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
  return (
    <>
      {ROWS.map((row) => (
        <div key={row[0]} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {row
            .map((key) => byKey[key])
            .filter(Boolean)
            .map(({ key, label, field }) => (
              <Field key={key} label={`Name (${label})`}>
                <input
                  aria-label={`Name (${label})`}
                  className={inputCls}
                  value={form[field] ?? ""}
                  onChange={(e) => update(field, e.target.value)}
                />
              </Field>
            ))}
        </div>
      ))}
    </>
  );
}
