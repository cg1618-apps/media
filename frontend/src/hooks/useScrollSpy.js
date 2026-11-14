// Frontend: which in-page anchor the reader has scrolled to.
//
// Shared by every sticky table of contents (TableOfContents). An anchor counts
// as reached once its top passes `offsetFor(id)` below the viewport's top -
// the height of whatever sticky header covers it - plus a little slack, so
// the highlight changes as a section's heading comes into view rather than
// after it has scrolled under the nav.
import { useEffect, useState } from "react";

const SLACK = 16;

// The sticky nav's height: the default cover over every anchor.
export function navOffset() {
  return (document.querySelector("nav")?.offsetHeight ?? 56) + 8;
}

// Scroll an anchor to just below whatever covers it.
export function scrollToAnchor(id, offsetFor = navOffset) {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - offsetFor(id);
  window.scrollTo({ top, behavior: "smooth" });
}

/**
 * The id of the last anchor whose top has passed under the sticky header,
 * or the first anchor before any has. `ids` may change as sections appear;
 * an id with no element on the page is skipped.
 */
export function useScrollSpy(ids, { offsetFor = navOffset, enabled = true } = {}) {
  const [activeId, setActiveId] = useState(ids[0] ?? null);
  // Callers build the list fresh on every render; the join keeps the effect
  // from re-subscribing on identity alone.
  const idsKey = ids.join(" ");

  useEffect(() => {
    if (!enabled || !idsKey) return undefined;
    const list = idsKey.split(" ");

    function update() {
      let active = list[0];
      for (const id of list) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= offsetFor(id) + SLACK) active = id;
      }
      setActiveId(active);
    }

    window.addEventListener("scroll", update, { passive: true });
    update();
    return () => window.removeEventListener("scroll", update);
  }, [idsKey, enabled, offsetFor]);

  return activeId;
}
