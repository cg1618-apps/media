// Frontend: a page's sticky table of contents.
//
// The list of in-page anchors that sits beside a long page: the dashboard's on
// the left, a detail page's on the right (DetailContents). It draws the rows
// and scrolls to the one clicked; which row is current comes from the caller's
// useScrollSpy, so the highlight and the scroll agree on the same offset.
// Level 2 rows are sub-entries, set smaller in mono.
import { Eyebrow } from "../ui/primitives";
import { navOffset, scrollToAnchor } from "../../hooks/useScrollSpy";

export default function TableOfContents({ items, activeId, offsetFor = navOffset }) {
  if (!items.length) return null;
  return (
    <nav aria-label="Contents" className="sticky top-[calc(var(--nav-h)+1rem)] space-y-0.5">
      <Eyebrow className="px-2 mb-3">Contents</Eyebrow>
      {items.map(({ id, label, level = 1 }) => {
        const isActive = activeId === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => scrollToAnchor(id, offsetFor)}
            aria-current={isActive ? "location" : undefined}
            className={`w-full text-left flex items-center gap-2 border-l-2 transition-colors py-1 ${
              level === 2
                ? "pl-5 pr-2 font-mono text-[11px] uppercase tracking-[0.12em]"
                : "pl-3 pr-2 font-display text-sm"
            } ${
              isActive
                ? "border-brand text-brand"
                : "border-transparent text-text-faint hover:text-text"
            }`}
          >
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
