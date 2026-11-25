// Frontend: the one sort control - a "Sort" caption, the select of sort keys
// and the button that reverses the chosen sort's direction.
//
// Used by every library toolbar (LibraryToolbar), the group hubs' member and
// tab sorts, and anything else that sorts a list the viewer reads. The caption
// sits outside the select, so each option is the plain key ("Title", "My
// rating"), never "Sort: Title".
//
// `options` is [{ value, label, descending? }]. `descending` says the sort's
// natural order runs high to low (best, newest, most first); a title sort and
// anything else A to Z or old to new leaves it out. The button shows the
// direction the list actually runs in - the natural one, or its reverse while
// `reversed` is on - and flips `reversed`. The caller holds `reversed` beside
// its sort and applies it with lib/sortDirection.js's `directed`.
import { effectiveDirection } from "../../lib/sortDirection";
import { Eyebrow } from "../ui/primitives";

export const SORT_SELECT_CLS =
  "bg-surface border border-border-strong px-3 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-brand transition";

const DIRECTION = {
  asc: { icon: "fa-arrow-up-short-wide", title: "Ascending" },
  desc: { icon: "fa-arrow-down-wide-short", title: "Descending" },
};

export default function SortControl({
  options,
  value,
  onChange,
  reversed = false,
  onReversedChange,
  label = "Sort",
  className = "",
}) {
  const current = options.find((o) => o.value === value) ?? options[0];
  const direction = DIRECTION[effectiveDirection(current?.descending, reversed)];
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <label className="flex items-center gap-2">
        <Eyebrow>{label}</Eyebrow>
        <select
          value={current?.value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={SORT_SELECT_CLS}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {onReversedChange && (
        <button
          type="button"
          onClick={() => onReversedChange(!reversed)}
          aria-label="Reverse order"
          aria-pressed={reversed}
          title={direction.title}
          data-direction={effectiveDirection(current?.descending, reversed)}
          className="px-2.5 py-1.5 border border-border-strong bg-surface text-sm text-text-muted hover:border-text hover:text-text transition-colors"
        >
          <i className={`fas ${direction.icon}`} aria-hidden="true"></i>
        </button>
      )}
    </div>
  );
}
