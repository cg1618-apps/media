// Frontend: the one dropdown list every type-or-choose input opens -
// SuggestInput, ComboBox, MultiSelect, NamesInput and the search pickers
// (auto-fill, IGDB, Modify's and Delete's title search).
//
// The list renders into document.body with position: fixed under its anchor,
// so a scroll container or a modal's overflow cannot clip it. It flips above
// the anchor when there is no room below, and is placed again on every
// scroll (capture phase: forms scroll inside their own containers, not the
// window) and resize. "Room below" is measured against the visual viewport
// where there is one: an iOS on-screen keyboard covers the bottom of the
// page without shrinking window.innerHeight, so measuring the window would
// open the list behind the keyboard. The visual viewport's own resize and
// scroll (the keyboard opening, closing, or panning) place it again too.
// z-[95] puts it over the z-50 modals and the expanded relation graph
// (z-[90]) and under the toasts (z-[100]).
//
// Two things a portal changes for the component that opens it:
//   - its "click outside closes me" listener sees a press on the list as
//     outside, because the list is no longer inside its box. So the list
//     stops a mousedown from reaching document, and every such listener
//     keeps working unchanged.
//   - a press must not blur the input before the pick lands, so the list and
//     every item cancel mousedown's default, and an item picks on mousedown.
//     A touch screen fires that mousedown only once a tap ends, never for a
//     drag, so scrolling a long list with a finger does not pick from it -
//     which pointerdown, firing as the finger lands, would.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export const SUGGEST_LIST_MAX_HEIGHT = 240;
const GAP = 2;
const MIN_WIDTH = 160;
const EDGE = 8;

// The bottom edge of what is actually visible, in the layout viewport's
// coordinates (the ones getBoundingClientRect and position: fixed use).
function visibleBottom() {
  const vv = window.visualViewport;
  return vv ? vv.offsetTop + vv.height : window.innerHeight;
}

function placeUnder(anchor) {
  const rect = anchor.getBoundingClientRect();
  const below = visibleBottom() - rect.bottom;
  const above = rect.top - (window.visualViewport?.offsetTop ?? 0);
  const up = below < SUGGEST_LIST_MAX_HEIGHT && above > below;
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
    const vv = window.visualViewport;
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
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

/**
 * The label of a row that acts on the typed text rather than naming an
 * option - `Add "<text>"`, `Search <source> for "<text>"`. It goes inside a
 * SuggestItem, after the options, so a phone has something to tap where a
 * desktop would press Enter.
 */
export function SuggestAction({ icon, children }) {
  return (
    <span className="flex items-center gap-2 font-semibold">
      <i className={`fas ${icon} text-[10px] text-brand`} aria-hidden="true"></i>
      {children}
    </span>
  );
}
