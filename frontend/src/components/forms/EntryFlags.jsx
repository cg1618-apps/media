// Frontend: the mark checkboxes of an entry form - Pin to dashboard, Plan
// Next, Redo - the first row of the marks section (FormMarksSection) at the
// top of the Add and Modify pages.
//
// `type` picks the flags from config/entryFlags.js; `f` is that type's form
// state and `u` its updater, so the flags save with the form like any other
// field. Each checkbox carries one label, which is also its accessible name.
// A type with no flags draws nothing.
import { entryFlagsFor } from "../../config/entryFlags";

export default function EntryFlags({ type, f, u }) {
  const flags = entryFlagsFor(type);
  if (!flags.length || !f) return null;
  return (
    <div data-testid="entry-flags" className="flex flex-wrap gap-6">
      {flags.map(([key, label]) => (
        <label key={key} className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!f[key]}
            onChange={(e) => u(key, e.target.checked)}
            className="w-4 h-4 rounded accent-brand"
          />
          <span className="text-sm font-bold text-text">{label}</span>
        </label>
      ))}
    </div>
  );
}
