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

// What identifies an item: a row's system_id, or the item itself. A saved row
// comes back as a new object with the same id, and a page may rebuild its
// list on every render (a context value that is not memoised is enough) - so
// identity alone would reset after every edit, and never let the list grow.
const keyOf = (item) => item?.system_id ?? item;

// The same items in the same order: what `keys` recorded, against `items`.
function sameKeys(keys, items) {
  return keys.length === items.length && keys.every((key, i) => key === keyOf(items[i]));
}

export function useIncrementalList(items, batch = INCREMENTAL_BATCH) {
  const [shown, setShown] = useState(() => ({ keys: items.map(keyOf), count: batch }));
  // A new list resets during render rather than in an effect, so the page
  // never draws one frame of the new list at the old length.
  const changed = !sameKeys(shown.keys, items);
  if (changed) setShown({ keys: items.map(keyOf), count: batch });

  const list = changed ? null : shown.keys;
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
          setShown((s) => (s.keys === list ? { keys: s.keys, count: s.count + batch } : s));
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
