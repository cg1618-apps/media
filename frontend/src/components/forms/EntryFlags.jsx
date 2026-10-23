// Frontend: the plan flags row of an entry form - Watch Next, To Rewatch,
// Read Next, To Reread, Play Next, To Replay - the last row of the My
// Tracker section on every type's Add and Modify body.
//
// `flags` is `[[key, label, caption], ...]`: the form key, the field label
// above the box, and the caption beside it, which is also the checkbox's
// accessible name. A type passes only the flags its schema has (cartoon has
// no to_rewatch).
import { Field } from "./FormField";

export default function EntryFlags({ f, u, flags }) {
  return (
    <div className="flex flex-wrap gap-6 mt-2">
      {flags.map(([key, label, caption]) => (
        <Field key={key} label={label}>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!f[key]}
              onChange={(e) => u(key, e.target.checked)}
              className="w-4 h-4 rounded accent-brand"
            />
            <span className="text-sm font-medium text-text-muted">{caption}</span>
          </label>
        </Field>
      ))}
    </div>
  );
}
