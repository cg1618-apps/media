// Frontend: a page's contents as a row of chips, for screens below xl.
//
// The contents column (TableOfContents) is drawn on xl+ only, so a phone or a
// tablet gets this bar at the top of the page instead: one chip per main row,
// in a single line that scrolls sideways inside itself when the chips do not
// fit. It takes the same `items`, `activeId` and `offsetFor` as the column,
// so the two list the same sections and scroll to the same place.
//
// Only level 1 rows become chips - the dashboard's level 2 rows repeat
// "Active" and "Paused" under every division, which reads as noise in one
// line. While the reader is inside a sub-row, its main row is the current
// chip. The current chip is kept in view by moving the row's own scroll,
// never the page's.
import { useEffect, useRef } from "react";

import { navOffset, scrollToAnchor } from "../../hooks/useScrollSpy";

// The current chip is brought back into view with this much room either side.
const MARGIN = 16;

// The main row `activeId` belongs to: itself, or the last level 1 row above it.
export function activeMainRow(items, activeId) {
  if (!activeId) return null;
  let main = null;
  for (const { id, level = 1 } of items) {
    if (level === 1) main = id;
    if (id === activeId) return main;
  }
  return null;
}

// Scrolls `list` sideways just enough that `chip` sits inside it.
export function keepChipInView(list, chip) {
  const left = chip.offsetLeft - list.offsetLeft;
  const right = left + chip.offsetWidth;
  if (left - MARGIN < list.scrollLeft) {
    list.scrollLeft = Math.max(0, left - MARGIN);
  } else if (right + MARGIN > list.scrollLeft + list.clientWidth) {
    list.scrollLeft = right + MARGIN - list.clientWidth;
  }
}

export default function ContentsBar({
  items,
  activeId,
  offsetFor = navOffset,
  sticky = false,
  className = "",
}) {
  const listRef = useRef(null);
  const current = activeMainRow(items, activeId);

  useEffect(() => {
    const list = listRef.current;
    if (!list || !current) return;
    const chip = list.querySelector('[aria-current="location"]');
    if (chip) keepChipInView(list, chip);
  }, [current]);

  const rows = items.filter(({ level = 1 }) => level === 1);
  if (!rows.length) return null;
  return (
    <nav
      ref={listRef}
      aria-label="Sections"
      data-contents-bar
      className={`xl:hidden flex gap-1.5 overflow-x-auto overscroll-x-contain bg-canvas py-2 border-b border-border ${
        sticky ? "sticky top-[var(--nav-h)] z-30" : ""
      } ${className}`.trim()}
    >
      {rows.map(({ id, label }) => {
        const isActive = current === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => scrollToAnchor(id, offsetFor)}
            aria-current={isActive ? "location" : undefined}
            className={`shrink-0 whitespace-nowrap px-2.5 py-1 border font-mono text-[11px] uppercase tracking-[0.12em] transition-colors ${
              isActive
                ? "border-brand text-brand"
                : "border-border text-text-faint hover:text-text hover:border-border-strong"
            }`}
          >
            {label}
          </button>
        );
      })}
    </nav>
  );
}

// How much of the viewport's top the bar covers while it is pinned: its
// height, or nothing where it is not drawn (xl+, where it is display:none).
export function contentsBarHeight() {
  return document.querySelector("[data-contents-bar]")?.offsetHeight ?? 0;
}
