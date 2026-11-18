// Frontend: the viewer's own rating and expectation of a grouping tier
// (collection, franchise, series) on the Add and Modify group forms. Drawn only for a
// viewer who keeps a list (self.list); the values are saved through
// /api/me/ratings by the page, not by the group's own write.
import { EXPECTATION_FIELD } from "../../api/mutations/useMyRatingMutations";
import { FRANCHISE_EXPECTATIONS, MY_RATINGS } from "../../config/fieldOptions";
import { useViewScope } from "../../hooks/useViewScope";
import { Field, selectCls } from "./FormField";

function OptionSelect({ label, value, options, onChange }) {
  return (
    <Field label={label}>
      <select
        className={selectCls}
        aria-label={label}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </Field>
  );
}

/**
 * `kind` is the tier; `form` and `update(key, value)` are the tab's own form
 * state and setter. The expectation is held under the tier's read field
 * (`series_expectation`, ...), as the row carries it.
 */
export default function GroupRatingFields({ kind, form, update }) {
  const { ownData } = useViewScope();
  if (!ownData) return null;
  const expectationField = EXPECTATION_FIELD[kind];
  return (
    <>
      <OptionSelect
        label="My Rating"
        value={form.my_rating}
        options={MY_RATINGS}
        onChange={(v) => update("my_rating", v)}
      />
      <OptionSelect
        label="Expectation"
        value={form[expectationField]}
        options={FRANCHISE_EXPECTATIONS}
        onChange={(v) => update(expectationField, v)}
      />
    </>
  );
}
