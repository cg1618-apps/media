// Frontend: draw a long list a batch at a time.
//
// A library loads its whole list in one response, so search, filter and sort
// all run client-side over every item. Drawing every card at once is another
// matter: hundreds of cards, each with a cover. This hook hands back the first
// `batch` items and adds the next batch whenever the sentinel - an empty
// element the page renders after the grid - comes within LOOKAHEAD of the
// screen. A new list (a search, a filter, a sort) starts again from one batch.
//
// Without an IntersectionObserver (jsdom) every item is drawn, so a test that
// counts cards sees all of them.
import { useEffect, useRef, useState } from "react";

export const INCREMENTAL_BATCH = 60;
const LOOKAHEAD = "800px";

// Read per call, not at import, so a test can install a fake observer.
const hasObserver = () => typeof IntersectionObserver !== "undefined";

// The same items in the same order, whether or not it is the same array. A
// page may rebuild its list on every render (a context value that is not
// memoised is enough), and resetting on identity alone would then never let
// the list grow past one batch.
function sameItems(a, b) {
  return a === b || (a.length === b.length && a.every((item, i) => item === b[i]));
}

export function useIncrementalList(items, batch = INCREMENTAL_BATCH) {
  const [shown, setShown] = useState({ items, count: batch });
  // A new list resets during render rather than in an effect, so the page
  // never draws one frame of the new list at the old length.
  const changed = !sameItems(shown.items, items);
  if (changed) setShown({ items, count: batch });

  const list = changed ? items : shown.items;
  const count = changed ? batch : shown.count;
  const observing = hasObserver();
  const hasMore = observing && count < items.length;
  const sentinelRef = useRef(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!hasMore || !sentinel) return undefined;
    // Re-made after every batch: observe() reports the sentinel's current
    // state at once, so a batch too short to push it off screen is followed
    // by the next one rather than stalling.
    const observer = new IntersectionObserver(
      ([record]) => {
        if (record.isIntersecting) {
          setShown((s) => (s.items === list ? { items: list, count: s.count + batch } : s));
        }
      },
      { rootMargin: LOOKAHEAD },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [list, batch, count, hasMore]);

  return {
    visible: observing ? items.slice(0, count) : items,
    hasMore,
    sentinelRef,
  };
}
