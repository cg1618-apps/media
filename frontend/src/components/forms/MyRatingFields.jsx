// Frontend: the viewer's own rating of a catalogue row on the Add and Modify
// forms - a grouping tier (collection, franchise, series), which also takes
// an expectation, and an entity (person, studio, publisher, character),
// which takes the rating alone. Drawn only for a viewer who keeps a list
// (self.list); the values are saved through /api/me/ratings by the page
// (useFormRatingSaver), not by the record's own write.
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
 * `kind` is the owner type; `form` and `update(key, value)` are the tab's own
 * form state and setter. A tier's expectation is held under its read field
 * (`series_expectation`, ...), as the row carries it; a kind with no
 * expectation (an entity) draws My Rating alone.
 */
export default function MyRatingFields({ kind, form, update }) {
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
      {expectationField && (
        <OptionSelect
          label="Expectation"
          value={form[expectationField]}
          options={FRANCHISE_EXPECTATIONS}
          onChange={(v) => update(expectationField, v)}
        />
      )}
    </>
  );
}
