// Which picker a Platform value is offered in. Parallel to ScopePicker,
// which answers "in which media types"; this answers "in which field" -
// Main Sources, where a title is watched (watch), vs. Official Source, where
// it first appeared (origin).
//
// Like scopes, usages are ADMIN-MANAGED data, never derived on save (Ruling
// R27 applies here too): a value with none selected serves both, which is the
// common case.
import { Field } from "./FormField";

export const USAGES = ["watch", "origin"];

// Mirrors USAGE_CATEGORIES in app/utils/source_fields.py. Platform is the only
// category that feeds two pickers, so it is the only one a usage can narrow;
// the API rejects a usage anywhere else.
export const USAGE_CATEGORIES = ["Platform"];

/** Whether this system_option category may carry usage rows at all. */
export function categoryHasUsages(category) {
  return USAGE_CATEGORIES.includes(category);
}

export default function UsagePicker({ usages, setUsages }) {
  const selected = new Set(usages || []);

  function toggle(key) {
    setUsages((prev) => {
      const next = new Set(prev || []);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      // Keep the stored order stable and matching the USAGES order.
      return USAGES.filter((u) => next.has(u));
    });
  }

  return (
    <Field
      label="Usages"
      hint="watch = Main Sources only. origin = Official Source only. None selected = both."
    >
      <div className="flex flex-wrap gap-1.5">
        {USAGES.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${
              selected.has(key)
                ? "bg-brand text-on-brand border-brand"
                : "bg-surface text-text-faint border-border hover:border-border-strong"
            }`}
          >
            {key}
          </button>
        ))}
      </div>
    </Field>
  );
}
