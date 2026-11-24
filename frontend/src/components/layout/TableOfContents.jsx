// Frontend: a page's sticky table of contents.
//
// The list of in-page anchors that sits on the right of a long page: the
// dashboard's, and a detail page's (DetailContents). It draws the rows
// and scrolls to the one clicked; which row is current comes from the caller's
// useScrollSpy, so the highlight and the scroll agree on the same offset.
// Level 2 rows are sub-entries, set smaller in mono.
//
// It stays pinned under the nav, but is never taller than the space under
// it: a list longer than the screen scrolls inside itself, so every row can
// be reached from anywhere on the page. As the page scrolls, the current row
// is kept in view inside the list - by moving the list's own scroll, never
// the page's.
import { useEffect, useRef } from "react";

import { Eyebrow } from "../ui/primitives";
import { navOffset, scrollToAnchor } from "../../hooks/useScrollSpy";

// The current row is brought back into view with this much of the list
// visible around it, so the rows either side of it show too.
const MARGIN = 32;

// Scrolls `list` just enough that `row` sits inside it, MARGIN from an edge.
export function keepInView(list, row) {
  const top = row.offsetTop - list.offsetTop;
  const bottom = top + row.offsetHeight;
  if (top - MARGIN < list.scrollTop) {
    list.scrollTop = Math.max(0, top - MARGIN);
  } else if (bottom + MARGIN > list.scrollTop + list.clientHeight) {
    list.scrollTop = bottom + MARGIN - list.clientHeight;
  }
}

export default function TableOfContents({ items, activeId, offsetFor = navOffset }) {
  const listRef = useRef(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list || !activeId) return;
    const row = list.querySelector('[aria-current="location"]');
    if (row) keepInView(list, row);
  }, [activeId]);

  if (!items.length) return null;
  return (
    <nav
      ref={listRef}
      aria-label="Contents"
      className="sticky top-[calc(var(--nav-h)+1rem)] max-h-[calc(100vh-var(--nav-h)-2rem)] overflow-y-auto overscroll-contain space-y-0.5"
    >
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
                ? "pl-5 pr-2 font-mono text-[11px]"
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
