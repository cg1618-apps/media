// Frontend: the random picker's mode strip - "All", then one chip per type.
// The picker links each mode to its own URL; the defaults editor switches
// modes in place, so it passes onSelect instead of linkTo.
import { Link } from "react-router-dom";

import { pickerTypeLabel } from "../../lib/randomPicker";

const CHIP =
  "px-2.5 py-1 border font-mono text-[11px] uppercase tracking-[0.12em] transition-colors";
const ON = "bg-brand text-on-brand border-brand";
const OFF =
  "bg-surface text-text-muted border-border-strong hover:border-text hover:text-text";

/**
 * current  the active mode: "all" or a type
 * types    the types to offer, already narrowed to what the session may see
 * linkTo   mode => URL, for a strip of links
 * onSelect mode => void, for a strip of buttons
 * marked   modes to flag with a dot (the editor's unsaved modes)
 */
export default function ModeStrip({ current, types, linkTo, onSelect, marked = [] }) {
  const modes = ["all", ...types];
  return (
    <nav aria-label="Picker mode" className="flex flex-wrap gap-1.5 border-b border-border pb-4">
      {modes.map((mode) => {
        const active = mode === current;
        const label = (
          <>
            {mode === "all" ? "All" : pickerTypeLabel(mode)}
            {marked.includes(mode) && <span aria-label="unsaved"> •</span>}
          </>
        );
        const className = `${CHIP} ${active ? ON : OFF}`;
        return linkTo ? (
          <Link
            key={mode}
            to={linkTo(mode)}
            aria-current={active ? "page" : undefined}
            className={className}
          >
            {label}
          </Link>
        ) : (
          <button
            key={mode}
            type="button"
            onClick={() => onSelect(mode)}
            aria-pressed={active}
            className={className}
          >
            {label}
          </button>
        );
      })}
    </nav>
  );
}
