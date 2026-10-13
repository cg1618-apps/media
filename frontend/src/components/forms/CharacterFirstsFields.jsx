// Frontend: the three firsts a character and an identity both carry - where
// it is first mentioned, first appears and is first encountered - as free-text
// inputs. CharacterFields and IdentityFields both render this, so the two
// forms label, explain and hint the notation the same way.
import { Field, SectionHeader, inputCls } from "./FormField";
import {
  CHARACTER_FIRST_FIELDS,
  CHARACTER_FIRST_PLACEHOLDER,
} from "../../lib/characterForm";

export default function CharacterFirstsFields({ form, update }) {
  return (
    <>
      <SectionHeader icon="fa-eye" title="First Appearances" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {CHARACTER_FIRST_FIELDS.map(({ field, label, hint }) => (
          <Field key={field} label={label} hint={hint}>
            <input
              aria-label={label}
              className={inputCls}
              value={form[field] ?? ""}
              onChange={(e) => update(field, e.target.value)}
              placeholder={CHARACTER_FIRST_PLACEHOLDER}
            />
          </Field>
        ))}
      </div>
    </>
  );
}
