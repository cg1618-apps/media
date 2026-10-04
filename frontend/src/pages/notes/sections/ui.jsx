// Frontend: the chrome shared by every notes section — card, row actions,
// save/cancel, link pills and row reorder. These used to be private helpers
// inside the 1500-line NotesTemplate; the shape components each own one file
// now, so the chrome lives here instead of being duplicated four times.
//
// Styled as archive slips (see docs/frontend/design-system.md): a flat
// bordered surface, a mono eyebrow title on a dotted rule, hairline dividers
// between rows. The cards stay `div.bg-surface` because NotesTemplate.test.jsx
// locates them by that selector.
import { useState } from "react";

import { Button } from "../../../components/ui/primitives";
import { DragHandle, SortableItem, SortableList, arrayMove } from "../../../components/ui/Sortable";

// Collapse state for a card whose emptiness decides its default.
//
// An empty section opens collapsed so a page of mostly-blank headers stays
// readable; anything holding rows opens expanded. The flag is DERIVED from the
// count rather than seeded into state at mount, because a card that fetches its
// own rows (quotes, memes) counts zero on its first render and fills in a tick
// later - a mount-time seed would leave it wrongly collapsed for good. A count
// of null/undefined means "not known yet" and never auto-collapses.
//
// `override` records an explicit click and wins from then on, so a card the
// reader opened by hand does not slam shut when its last row is deleted.
function useCollapsed(count) {
  const [override, setOverride] = useState(null);
  return [override === null ? count === 0 : override, setOverride];
}

export const inputCls =
  "w-full border border-border-strong bg-surface text-text px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand";

// A mono tag for a row's locator / kind / status. Ink only - colour never
// encodes a category.
export const tagCls =
  "inline-flex items-center border border-border-strong px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] leading-none text-text-muted whitespace-nowrap";
export const brandTagCls =
  "inline-flex items-center border border-brand px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] leading-none text-brand whitespace-nowrap";

// A row inside a section: a hairline above, no box.
export const rowCls = "border-t border-border pt-2 first:border-t-0 first:pt-0";
// The draft row: dashed so the reader sees it is not saved yet.
export const draftCls = "border border-dashed border-border-strong p-2.5";

const chevron = (collapsed) => (
  <span
    aria-hidden="true"
    className="font-mono text-[10px] text-text-faint select-none"
  >
    {collapsed ? "+" : "−"}
  </span>
);

const countCls = "font-mono text-[10px] text-text-faint tabular-nums";

// `actions` are extra header controls drawn before Add - a section's view
// toggles. They sit in the header's click-shielded strip, so pressing one
// never collapses the card.
export function SectionCard({ label, count, isAdmin, onAdd, actions, children }) {
  const [collapsed, setCollapsed] = useCollapsed(count);
  return (
    <div className="bg-surface border border-border">
      <div
        className="flex items-center gap-3 px-3 py-2 border-b border-border cursor-pointer select-none"
        onClick={() => setCollapsed(!collapsed)}
      >
        <h4 className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted shrink-0">
          {label}
        </h4>
        {count > 0 && <span className={countCls}>{count}</span>}
        <span className="flex-1 border-t border-dotted border-border-strong/60" />
        <div
          className="flex items-center gap-2 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {actions}
          {isAdmin && onAdd && (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                // The draft row renders in the body, so adding to a collapsed
                // (i.e. empty) section has to open it or the form never shows.
                setCollapsed(false);
                onAdd();
              }}
            >
              Add
            </Button>
          )}
          <span onClick={() => setCollapsed(!collapsed)}>{chevron(collapsed)}</span>
        </div>
      </div>
      {!collapsed && <div className="p-3 space-y-2">{children}</div>}
    </div>
  );
}

// The card a group of sections renders inside - 音樂 Music holds OP, ED,
// Insert, OST, OP/ED 變動 and 插入曲. It is a sibling of the Notes card, not a
// section within it, so it wears the same chrome as that card: a group is a
// peer of Notes, and nesting one card two deep read as a subsection of it.
// Each child is still its own SectionCard, so a group collapses as a unit and
// its subsections collapse individually. `showCount` is for the Notes card,
// which borrows this chrome to gain the same collapse-when-empty behaviour but
// has never worn a count badge. `icon` is accepted (the registry still sends
// one) and ignored: section titles do not carry icons.
export function GroupCard({ label, count, showCount = true, children }) {
  const [collapsed, setCollapsed] = useCollapsed(count);
  return (
    <div className="bg-surface border border-border">
      <div
        className="flex items-center gap-3 px-4 py-2.5 border-b border-border cursor-pointer select-none"
        onClick={() => setCollapsed(!collapsed)}
      >
        <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted shrink-0">
          {label}
        </h3>
        {showCount && count > 0 && <span className={countCls}>{count}</span>}
        <span className="flex-1 border-t border-dotted border-border-strong/60" />
        {chevron(collapsed)}
      </div>
      {!collapsed && <div className="p-4 space-y-3">{children}</div>}
    </div>
  );
}

export function ItemActions({ isAdmin, onEdit, onDelete }) {
  if (!isAdmin) return null;
  return (
    <div className="flex gap-1 shrink-0 mt-0.5">
      <button
        type="button"
        onClick={onEdit}
        aria-label="Edit"
        title="Edit"
        className="text-text-faint hover:text-brand text-xs px-1"
      >
        <i className="fas fa-pencil-alt"></i>
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete"
        title="Delete"
        className="text-text-faint hover:text-danger text-xs px-1"
      >
        <i className="fas fa-trash"></i>
      </button>
    </div>
  );
}

export function SaveCancel({ onSave, onCancel }) {
  return (
    <div className="flex gap-2 mt-2">
      <Button type="button" kind="primary" size="sm" onClick={onSave}>
        Save
      </Button>
      <Button type="button" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

// `label` overrides the text shown - a link pair's own text. Without one the
// pill shows the link's host.
export function LinkPill({ url, label: given }) {
  const label =
    given ||
    (() => {
      try {
        return new URL(url).hostname;
      } catch {
        return url;
      }
    })();
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-mono text-[11px] text-text-muted hover:text-brand border border-border px-1.5 py-0.5 max-w-[200px] truncate transition"
    >
      <i className="fas fa-external-link-alt text-[9px]"></i>
      {label}
    </a>
  );
}

// A repeatable list of URL inputs, shared by every section whose links are URL
// strings rather than pairs.
export function LinksEditor({ links, onChange }) {
  const list = links?.length ? links : [""];
  const setLink = (i, v) => onChange(list.map((l, idx) => (idx === i ? v : l)));
  return (
    <div className="space-y-1">
      {list.map((l, i) => (
        <div key={i} className="flex gap-1">
          <input
            value={l}
            onChange={(e) => setLink(i, e.target.value)}
            placeholder="https://..."
            className={inputCls}
          />
          {list.length > 1 && (
            <button
              type="button"
              onClick={() => onChange(list.filter((_, idx) => idx !== i))}
              aria-label="Remove link"
              title="Remove link"
              className="text-text-faint hover:text-danger px-1"
            >
              <i className="fas fa-times text-xs"></i>
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...list, ""])}
        className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted hover:text-brand transition"
      >
        + Add link
      </button>
    </div>
  );
}

// --- The entry cap --------------------------------------------------------

// How many rows a section shows before the rest fold behind "Show all". Three
// keeps a page of sections scannable; the count badge on the card already says
// how many there are in all.
export const VISIBLE_ENTRIES = 3;

// The rows a section draws: all of them when unfolded, otherwise the first
// VISIBLE_ENTRIES plus any row `keep` pins - the row being edited, so folding
// the section never throws away a half-written form. A pinned row keeps its
// place in the list rather than jumping to the end.
export function capEntries(items, expanded, keep) {
  if (expanded || items.length <= VISIBLE_ENTRIES) return items;
  return items.filter((item, i) => i < VISIBLE_ENTRIES || (keep ? keep(item) : false));
}

// The fold state for one list of rows. `visible` is what to draw, `toggle` is
// the props for ShowAllToggle, and `expand` is for a caller that moves a row
// past the cap and so has to unfold the list, or the row would vanish.
//
// Starts folded, and stays however the reader left it: rows arriving or going
// do not reset it.
export function useEntryCap(items, { keep } = {}) {
  const [expanded, setExpanded] = useState(false);
  return {
    visible: capEntries(items, expanded, keep),
    toggle: {
      total: items.length,
      expanded,
      onToggle: () => setExpanded(!expanded),
    },
    expand: () => setExpanded(true),
  };
}

// The control under a capped list. Draws nothing when the list fits.
export function ShowAllToggle({ total, expanded, onToggle }) {
  if (total <= VISIBLE_ENTRIES) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted hover:text-brand transition"
    >
      {expanded ? "Show less" : `Show all (${total})`}
    </button>
  );
}

// --- Row reorder ----------------------------------------------------------

// Drag-to-reorder for a flat section: every shape but `structured`, which
// orders a tree and so does its own. `onReorder` and `reordering` come from
// NotesProvider; `cap` is the section's useEntryCap.
//
// The sortable list holds EVERY row's id even while the section is folded, so
// a row's index is its place among all of them and the last row shown can be
// moved down past the fold - which unfolds the section, or the row would
// vanish. Each move sends the whole section's order, which is what
// PATCH /api/notes/reorder takes. While a move is being saved every handle is
// disabled (`reordering`). Only an admin with two rows or more gets handles.
export function useRowReorder({ section, notes, isAdmin, onReorder, reordering, cap }) {
  const ids = notes.map((n) => n.system_id);
  return {
    on: isAdmin && Boolean(onReorder) && ids.length > 1,
    ids,
    disabled: Boolean(reordering),
    move: (from, to) => {
      if (from === to) return;
      if (to >= VISIBLE_ENTRIES) cap.expand();
      onReorder(section.key, arrayMove(ids, from, to));
    },
  };
}

// The rows of a section, sortable when `reorder.on`.
export function ReorderList({ reorder, children }) {
  if (!reorder.on) return <>{children}</>;
  return (
    <SortableList ids={reorder.ids} onMove={reorder.move} disabled={reorder.disabled}>
      {children}
    </SortableList>
  );
}

// One row: a SortableItem when the section is sortable, a plain div otherwise.
export function ReorderRow({ reorder, id, className = "", children }) {
  if (!reorder.on) return <div className={className}>{children}</div>;
  return (
    <SortableItem id={id} className={className}>
      {children}
    </SortableItem>
  );
}

// What a row's grip is called for screen readers ("Reorder Episode 3"): the
// first of its name, locator, text or first link, cut short. A link is a URL
// string or, on the link-pair sections, a {text, url} pair.
export function noteLabel(note) {
  const link = (note.links || [])
    .map((l) => (typeof l === "string" ? l : l?.text || l?.url))
    .find(Boolean);
  const text = (note.title || note.locator || note.content || link || "").trim();
  if (!text) return "entry";
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

// The grip, or nothing when the section is not sortable.
export function ReorderHandle({ reorder, note, className = "" }) {
  if (!reorder.on) return null;
  return <DragHandle label={noteLabel(note)} className={className} />;
}

export const EmptyHint = () => <p className="text-xs text-text-faint">No entries.</p>;
