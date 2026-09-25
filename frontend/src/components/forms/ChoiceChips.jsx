// A multi-choice field over a fixed vocabulary, drawn as toggle chips.
//
// The value is a list over `options` or null, and the two are different
// answers: [] says "none of these" (an h-game with no voiced scenes), null
// says "not recorded". So besides one chip per option there are two state
// chips, None and Unknown, which set the value to [] and null outright - the
// only way back to null once a chip has been pressed, and the only way to say
// "none" without it reading as "never filled in".
//
// Shaped like PublisherScopePills: the chosen list is rebuilt in vocabulary
// order on every toggle, so what is posted does not depend on click order. A
// stored value the vocabulary no longer has is kept at the end rather than
// silently dropped by the next toggle.
const CHIP_CLS =
  "px-2.5 py-1 rounded-full border text-xs font-bold transition-colors";
const ON_CLS = "bg-brand text-on-brand border-brand";
const OFF_CLS =
  "bg-surface text-text-faint border-border hover:border-border-strong";
const STATE_OFF_CLS =
  "bg-surface text-text-faint border-dashed border-border-strong hover:text-text-muted";
const STATE_ON_CLS = "bg-surface-2 text-text border-text";

/** `value` with `option` toggled, in the order `options` gives. */
export function toggleChoice(options, value, option) {
  const held = new Set(value || []);
  if (held.has(option)) held.delete(option);
  else held.add(option);
  return [
    ...options.filter((o) => held.has(o)),
    ...[...held].filter((o) => !options.includes(o)),
  ];
}

export default function ChoiceChips({ options, value, onChange, label }) {
  const held = new Set(value || []);
  const isNone = Array.isArray(value) && value.length === 0;
  const isUnknown = value == null;

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={held.has(option)}
          onClick={() => onChange(toggleChoice(options, value, option))}
          className={`${CHIP_CLS} ${held.has(option) ? ON_CLS : OFF_CLS}`}
        >
          {option}
        </button>
      ))}
      <span className="w-px h-4 bg-border mx-1" aria-hidden="true" />
      <button
        type="button"
        aria-pressed={isNone}
        title="None of these"
        onClick={() => onChange([])}
        className={`${CHIP_CLS} ${isNone ? STATE_ON_CLS : STATE_OFF_CLS}`}
      >
        None
      </button>
      <button
        type="button"
        aria-pressed={isUnknown}
        title="Not recorded"
        onClick={() => onChange(null)}
        className={`${CHIP_CLS} ${isUnknown ? STATE_ON_CLS : STATE_OFF_CLS}`}
      >
        Unknown
      </button>
    </div>
  );
}
