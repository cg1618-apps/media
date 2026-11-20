// A single-choice field over a fixed vocabulary, drawn as a row of chips:
// one click picks a value, a click on the picked chip clears it back to "".
//
// The single-choice sibling of ChoiceChips, and drawn with the same chip
// classes so the two read as one control family. It holds no None/Unknown
// state chips: the value is a plain string where "" is unset, as in the
// selects it sits beside or replaces (a gender, a character's own role, a
// casting's role).
//
// A stored value the vocabulary does not offer simply lights no chip; the
// caller keeps a select beside the chips wherever such a value can occur.
//
// `multiple` makes it a toggle row over a list instead: `value` is an array,
// a click adds the option at the end or takes it out, and a held value the
// vocabulary does not offer is kept (a studio's countries, typed beside the
// chips).
const CHIP_CLS =
  "px-2.5 py-1 rounded-full border text-xs font-bold transition-colors";
const ON_CLS = "bg-brand text-on-brand border-brand";
const OFF_CLS =
  "bg-surface text-text-faint border-border hover:border-border-strong";

/** The value after clicking `option`: it, or "" when it was already picked. */
export function pickValue(value, option) {
  return value === option ? "" : option;
}

/** A `multiple` row's list after clicking `option`: added at the end, or removed. */
export function toggleValue(values, option) {
  const held = values || [];
  return held.includes(option)
    ? held.filter((v) => v !== option)
    : [...held, option];
}

export default function QuickPicks({
  options,
  value,
  onChange,
  label,
  className = "",
  multiple = false,
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 ${className}`.trim()}
      role="group"
      aria-label={label}
    >
      {options.map((option) => {
        const on = multiple ? (value || []).includes(option) : value === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            title={on ? (multiple ? "Click again to remove" : "Click again to clear") : undefined}
            onClick={() =>
              onChange(multiple ? toggleValue(value, option) : pickValue(value, option))
            }
            className={`${CHIP_CLS} ${on ? ON_CLS : OFF_CLS}`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
