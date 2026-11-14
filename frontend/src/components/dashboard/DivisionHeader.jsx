// Frontend: the sticky header of one dashboard division - an eyebrow, a
// display title, and a mono count at the right. Pins below the nav; the TOC
// reads its height through `data-division-header`.
import { Eyebrow } from "../ui/primitives";

export default function DivisionHeader({ eyebrow, title, count }) {
  return (
    <div
      data-division-header
      className="sticky top-[var(--nav-h)] z-30 bg-canvas flex items-end justify-between gap-3 pb-2 border-b border-border-strong"
    >
      <div>
        {eyebrow && <Eyebrow className="mb-1">{eyebrow}</Eyebrow>}
        <h2 className="font-display text-3xl font-semibold text-text leading-none">
          {title}
        </h2>
      </div>
      {count != null && (
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
          {count}
        </span>
      )}
    </div>
  );
}
