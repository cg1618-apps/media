// Frontend: the viewer's own rating of a group - and, with `expectation`, a
// tier's expectation - on the Add and Modify group forms. Drawn only for a
// viewer who keeps a list (self.list); the values are saved through
// /api/me/ratings by the page, not by the group's own write.
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
 * `form` and `update(key, value)` are the tab's own form state and setter;
 * `expectationField` names the form key the expectation is held under, and
 * leaving it out draws the rating alone.
 */
export default function GroupRatingFields({ form, update, expectationField }) {
  const { ownData } = useViewScope();
  if (!ownData) return null;
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
