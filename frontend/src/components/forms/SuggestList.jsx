// Frontend: the one dropdown list every type-or-choose input opens -
// SuggestInput, ComboBox, MultiSelect, NamesInput and the search pickers
// (auto-fill, IGDB, Modify's and Delete's title search).
//
// The list renders into document.body with position: fixed under its anchor,
// so a scroll container or a modal's overflow cannot clip it. It flips above
// the anchor when there is no room below, and is placed again on every
// scroll (capture phase: forms scroll inside their own containers, not the
// window) and resize. z-[95] puts it over the z-50 modals and the expanded
// relation graph (z-[90]) and under the toasts (z-[100]).
//
// Two things a portal changes for the component that opens it:
//   - its "click outside closes me" listener sees a press on the list as
//     outside, because the list is no longer inside its box. So the list
//     stops a mousedown from reaching document, and every such listener
//     keeps working unchanged.
//   - a press must not blur the input before the pick lands, so the list and
//     every item cancel mousedown's default, and an item picks on mousedown.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export const SUGGEST_LIST_MAX_HEIGHT = 240;
const GAP = 2;
const MIN_WIDTH = 160;
const EDGE = 8;

function placeUnder(anchor) {
  const rect = anchor.getBoundingClientRect();
  const below = window.innerHeight - rect.bottom;
  const up = below < SUGGEST_LIST_MAX_HEIGHT && rect.top > below;
  return {
    left: rect.left,
    minWidth: Math.max(rect.width, MIN_WIDTH),
    maxWidth: Math.max(window.innerWidth - rect.left - EDGE, MIN_WIDTH),
    ...(up
      ? { bottom: window.innerHeight - rect.top + GAP }
      : { top: rect.bottom + GAP }),
  };
}

/** Moves a highlighted index one step, between -1 (nothing) and the last. */
export function stepActive(current, step, count) {
  return Math.max(-1, Math.min(count - 1, current + step));
}

/**
 * The portaled listbox, placed under `anchorRef.current`. Render it only
 * while the list is open; its children are SuggestItem / SuggestNote.
 */
export function SuggestList({ anchorRef, id, label, children }) {
  const [place, setPlace] = useState(null);

  useLayoutEffect(() => {
    const update = () => {
      if (anchorRef.current) setPlace(placeUnder(anchorRef.current));
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [anchorRef]);

  if (!place) return null;
  return createPortal(
    <ul
      id={id}
      role="listbox"
      aria-label={label}
      style={{ ...place, maxHeight: SUGGEST_LIST_MAX_HEIGHT }}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className="fixed z-[95] m-0 list-none overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-lg"
    >
      {children}
    </ul>,
    document.body,
  );
}

/**
 * One option. `active` is the keyboard highlight, kept in view as it moves;
 * a pointer gets the same look by hover. `onPick` runs on mousedown, before
 * the input could blur. `truncate={false}` lets a rich row (title over a
 * subtitle) wrap instead of cutting to one line.
 */
export function SuggestItem({
  id,
  active = false,
  onPick,
  onHover,
  truncate = true,
  children,
}) {
  const ref = useRef(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [active]);
  return (
    <li
      ref={ref}
      id={id}
      role="option"
      aria-selected={active}
      onMouseDown={(e) => {
        e.preventDefault();
        onPick?.();
      }}
      onMouseEnter={onHover}
      className={`cursor-pointer rounded-sm px-3 py-1.5 text-sm hover:bg-brand-soft hover:text-brand ${
        truncate ? "truncate" : ""
      } ${active ? "bg-brand-soft text-brand" : "text-text"}`}
    >
      {children}
    </li>
  );
}

/** A line in the list that is not an option: no matches, loading, a hint. */
export function SuggestNote({ children }) {
  return (
    <li role="presentation" className="flex items-center gap-2 px-3 py-1.5 text-xs text-text-faint">
      {children}
    </li>
  );
}
