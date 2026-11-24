// A labelled yes / no / all filter: one segmented control, "All" first and
// the default, so the filter reads as off until a side is picked. Sized to sit
// in a row of the hubs' filter pills (pillCls).
import { Eyebrow } from "../ui/primitives";

const OPTIONS = [
  { value: "all", label: "All" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

export default function TriStateFilter({ label, value, onChange }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1.5">
      <Eyebrow as="span" className="whitespace-nowrap">
        {label}
      </Eyebrow>
      <div className="inline-flex items-center border border-border-strong divide-x divide-border-strong">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            aria-pressed={value === opt.value}
            onClick={() => onChange(opt.value)}
            className={`px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
              value === opt.value
                ? "bg-brand-soft text-brand"
                : "text-text-muted hover:text-text"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
