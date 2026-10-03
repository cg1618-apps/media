// Frontend: admin editor for one watch order.
//
// Everything that writes to /api/watch-order lives here. The read-only
// renderer is WatchOrderGuide; this component deliberately does not reuse it,
// because an editable row needs inputs where the guide needs links.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  MeasuringStrategy,
  pointerWithin,
  useDndContext,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

import { buildUrl, jsonBody } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { useToast } from "../../hooks/useToast";
import { useAuth } from "../../contexts/AuthContext";
import { canSeeGatedType } from "../../lib/gatedTypes";
import { getCoverUrl, FALLBACK_SVG, focusStyle } from "../../lib/covers";
import { Button, Chip, Eyebrow, Slip } from "../ui/primitives";
import { useDragSensors } from "../ui/Sortable";
import {
  buildBlocks,
  MediaScopeLine,
  specialLabel,
  supportsEpisodeRange,
} from "./WatchOrderGuide";
import {
  buildTokens,
  changesNothing,
  moveBlock,
  moveStepByIndex,
  moveStepIntoGap,
  moveStepIntoPart,
  orderPayload,
} from "./watchOrderLayout";

// The rungs a step can sit on, most important first. Mirrors ITEM_IMPORTANCE
// in app/services/domain/watch_order.py, which validates them.
export const ITEM_IMPORTANCE = [
  "Essential",
  "Recommended",
  "Normal",
  "Optional",
];

// Exported so the create form on /watch-orders offers exactly the same
// choices the editor does.
export const LIST_TYPES = [
  "Custom",
  "Chronological",
  "Release",
  "Recommended",
];

const TYPE_LABELS = {
  anime: "Anime",
  "anime-movie": "Anime Movie",
  movie: "Movie",
  "tv-show": "TV Show",
  cartoon: "Cartoon",
  manga: "Manga",
  novel: "Novel",
  comic: "Comic",
  // Gated: each offered as a filter only to a session that can see its type.
  "h-comic": "H-Comic",
  "h-game": "H-Game",
  hentai: "Hentai",
};

// Steps and parts are dragged on dnd-kit's pointer events, not native HTML5
// drag: a native drag swallows the mouse wheel on Windows, and a guide can run
// to a hundred steps, so the page has to keep scrolling under the wheel while
// a row is held. Ids are namespaced because a step, a part and a gap are all
// drop targets in one context.
const dragId = {
  item: (id) => `drag-item:${id}`,
  part: (id) => `drag-part:${id}`,
};
const dropId = {
  row: (id) => `row:${id}`,
  part: (id) => `part:${id}`,
  gap: (index) => `gap:${index}`,
};

const lockToVerticalAxis = ({ transform }) => ({ ...transform, x: 0 });

const SCREEN_READER = {
  draggable:
    "Drag to reorder, or press the up and down arrow keys to move one place.",
};

// The innermost target wins: a row or a gap inside a part box beats the box,
// so dropping onto a row is never mistaken for "append to this part".
function innermostUnderPointer(args) {
  const hits = pointerWithin(args);
  const inner = hits.find((hit) => !String(hit.id).startsWith("part:"));
  return inner ? [inner] : hits.slice(0, 1);
}

/**
 * The grip a step or a part is dragged by - the same look, labels and keys as
 * the shared DragHandle in ui/Sortable, which this cannot use directly: a
 * watch order is not one flat sortable list but steps, parts and gaps.
 *
 * It is never `disabled`, only aria-disabled while a save is in flight: a
 * disabled button drops focus, and a held arrow key has to keep moving the
 * same row once the save lands.
 */
function Grip({ label, drag, busy, onStep, registerHandle }) {
  const ref = (el) => {
    drag.setActivatorNodeRef(el);
    registerHandle(el);
  };
  return (
    <button
      type="button"
      ref={ref}
      {...drag.attributes}
      {...drag.listeners}
      aria-disabled={busy}
      onKeyDown={(e) => {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        e.preventDefault();
        onStep(e.key === "ArrowUp" ? -1 : 1);
      }}
      aria-label={`Reorder ${label}`}
      title="Drag to reorder (or focus and press ↑/↓)"
      className={`shrink-0 touch-none select-none px-1 text-text-faint/60 hover:text-text-faint aria-disabled:opacity-30 ${
        drag.isDragging ? "cursor-grabbing" : "cursor-grab"
      }`}
    >
      <i className="fas fa-grip-vertical text-[11px]" aria-hidden="true" />
    </button>
  );
}

function dragStyle(drag) {
  return { transform: CSS.Translate.toString(drag.transform) };
}

function ItemRow({
  item,
  index,
  total,
  onPatch,
  onRemove,
  onMove,
  busy = false,
  registerHandle,
  readOnly = false,
}) {
  const drag = useDraggable({
    id: dragId.item(item.system_id),
    data: { type: "item", itemId: item.system_id },
    disabled: readOnly || busy,
  });
  const drop = useDroppable({
    id: dropId.row(item.system_id),
    data: { type: "row", itemId: item.system_id },
    disabled: readOnly,
  });

  // Episode inputs are held locally so typing doesn't fire a request per
  // keystroke; the value is committed on blur.
  const [epStart, setEpStart] = useState(item.ep_start ?? "");
  const [epEnd, setEpEnd] = useState(item.ep_end ?? "");
  const [note, setNote] = useState(item.note ?? "");
  // Same reason: "12" passes through "1" on the way, and moving the step to
  // slot 1 mid-keystroke would reorder the list out from under the typist.
  const [slot, setSlot] = useState(String(index));

  useEffect(() => {
    setEpStart(item.ep_start ?? "");
    setEpEnd(item.ep_end ?? "");
    setNote(item.note ?? "");
  }, [item.ep_start, item.ep_end, item.note]);

  // A move by any means - drag, the arrows, or another row's typed slot -
  // changes this row's number, so the box follows the list rather than
  // holding whatever was last typed into it.
  useEffect(() => {
    setSlot(String(index));
  }, [index]);

  function commit(field, raw) {
    const value = raw === "" ? null : raw;
    if ((item[field] ?? null) === value) return;
    onPatch(item.system_id, { [field]: value });
  }

  /**
   * Moves this step to the typed slot, counting the way the badges read (1..N)
   * rather than in the stored float positions - the reorder endpoint renumbers
   * to 1..N regardless, so a typed 2.5 would be normalized away by the next
   * move anyway.
   *
   * Out of range clamps to the nearest end, which is what someone typing 99 to
   * mean "last" intends. Anything unparseable simply restores the current slot.
   */
  function commitSlot() {
    const parsed = Number.parseInt(slot, 10);
    if (Number.isNaN(parsed)) {
      setSlot(String(index));
      return;
    }
    const target = Math.min(Math.max(parsed, 1), total);
    // Typing 0 on the first row is not a move, and a move refused because the
    // last one is still saving is not either: either way the box goes back to
    // reading the step's real slot.
    if (target === index || !onMove(index - 1, target - 1)) {
      setSlot(String(index));
    }
  }

  const overByOther = drop.isOver && !drag.isDragging;

  return (
    <li
      ref={(el) => {
        drag.setNodeRef(el);
        drop.setNodeRef(el);
      }}
      style={dragStyle(drag)}
      className={`flex flex-col gap-2 p-3 border bg-surface ${
        item.missing ? "border-dashed border-danger" : "border-border"
      } ${drag.isDragging ? "relative z-10 opacity-80" : ""} ${
        overByOther ? "ring-2 ring-brand" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        {!readOnly && (
          <Grip
            label={item.display_name || `step ${index}`}
            drag={drag}
            busy={busy}
            onStep={(delta) => onMove(index - 1, index - 1 + delta)}
            registerHandle={registerHandle}
          />
        )}
        {/*
          A box rather than the old circle: a caret and two digits do not fit a
          28px round badge. Typing a slot is the second way to reorder, beside
          dragging, and the only one that works when the destination is
          off-screen.
        */}
        {readOnly ? (
          <span className="w-9 h-7 shrink-0 border border-brand text-brand font-mono text-xs flex items-center justify-center">
            {index}
          </span>
        ) : (
          <input
            type="number"
            min={1}
            max={total}
            value={slot}
            title="Type a position to move this step"
            aria-label={`Position, currently ${index} of ${total}`}
            onChange={(e) => setSlot(e.target.value)}
            onBlur={commitSlot}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setSlot(String(index));
                // Blurring after the reset would commit the restored value
                // through onBlur, which is harmless but pointless; leaving
                // focus put also lets the typist correct and retry.
                e.currentTarget.select();
              }
            }}
            className="w-9 h-7 shrink-0 bg-surface text-brand font-mono text-xs text-center border border-brand hover:bg-brand-soft focus:outline-none focus:ring-2 focus:ring-brand [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        )}

        {item.missing ? (
          <span className="text-sm text-danger flex-1">
            Entry no longer exists — remove this step
          </span>
        ) : (
          <>
            <img
              src={getCoverUrl(item.cover_image_file)}
              alt=""
              loading="lazy"
              onError={(e) => {
                e.currentTarget.src = FALLBACK_SVG;
              }}
              className="w-9 h-12 shrink-0 object-cover bg-surface-2 border border-border"
              style={focusStyle(item.cover_image_focus)}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-display font-bold text-text truncate">
                {item.display_name}
              </p>
              <p className="font-mono text-[11px] text-text-faint">
                {TYPE_LABELS[item.media_type] || item.media_type}
                {item.release_display && ` · ${item.release_display}`}
                {item.total_episodes != null && ` · ${item.total_episodes} total`}
                {specialLabel(item) && ` · ${specialLabel(item)}`}
              </p>
            </div>
          </>
        )}

        <div className={`flex items-center gap-1 ${readOnly ? "hidden" : ""}`}>
          <button
            type="button"
            onClick={() => onRemove(item.system_id)}
            title="Remove step"
            aria-label="Remove step"
            className="w-7 h-7 inline-flex items-center justify-center border border-border-strong text-text-muted hover:text-danger hover:border-danger disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <i className="fas fa-trash text-xs"></i>
          </button>
        </div>
      </div>

      <div
        className={`flex flex-wrap items-center gap-2 pl-10 ${
          readOnly ? "hidden" : ""
        }`}
      >
        {/*
          A movie, manga or novel step covers its entry whole, so the from/to
          pair is omitted rather than disabled - there is nothing to fill in.
          A comic run is not in that set: its steps are numbered by issue, so
          it keeps the pair the way the episodic types do.
          Any range already stored on such a step is left alone and still
          renders in the guide; silently clearing it would delete the admin's
          data to satisfy a display rule.
        */}
        {supportsEpisodeRange(item.media_type) && (
          <>
            <input
              type="number"
              value={epStart}
              onChange={(e) => setEpStart(e.target.value)}
              onBlur={() =>
                commit("ep_start", epStart === "" ? "" : Number(epStart))
              }
              placeholder="from"
              className="w-20 px-2 py-1 font-mono text-xs border border-border-strong bg-surface text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <span className="text-xs text-text-faint">–</span>
            <input
              type="number"
              value={epEnd}
              onChange={(e) => setEpEnd(e.target.value)}
              onBlur={() => commit("ep_end", epEnd === "" ? "" : Number(epEnd))}
              placeholder="to"
              className="w-20 px-2 py-1 font-mono text-xs border border-border-strong bg-surface text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <span className="font-mono text-[10px] text-text-faint">
              leave blank for the whole entry
            </span>
          </>
        )}

        {/*
          Three buttons rather than a dropdown: the whole ladder is visible at
          a glance while scanning a list of steps, and setting a rung costs one
          click instead of two. The active rung is tinted brand-soft; colour
          never says which rung it is, the label does.
        */}
        <div
          role="group"
          aria-label="Importance"
          className="inline-flex items-center ml-auto border border-border-strong divide-x divide-border-strong"
        >
          {ITEM_IMPORTANCE.map((level) => {
            const active = (item.importance || "Normal") === level;
            return (
              <button
                key={level}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  onPatch(item.system_id, { importance: level })
                }
                className={`font-mono text-[10px] uppercase tracking-[0.12em] px-2 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  active
                    ? "bg-brand-soft text-brand"
                    : "text-text-muted hover:text-text"
                }`}
              >
                {level}
              </button>
            );
          })}
        </div>
      </div>

      {!readOnly && (
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => commit("note", note)}
          placeholder="Note for this step"
          className="ml-10 px-2 py-1 text-xs border border-border-strong bg-surface text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-brand"
        />
      )}
    </li>
  );
}

// What the list already holds, keyed the way a candidate identifies itself.
// Deliberately says only "this entry is in the list" and, when the steps carry
// episode ranges, which ones - never whether those ranges add up to the whole
// entry. That would mean trusting ep_total, which is blank often enough that
// the claim would be wrong exactly where it mattered.
function buildAddedIndex(items) {
  const index = new Map();
  for (const item of items) {
    if (!item.media_type || !item.entry_id) continue;
    const key = `${item.media_type}:${item.entry_id}`;
    const entry = index.get(key) || { count: 0, ranges: [], whole: false };
    // No range at all means the step covers the entry as a whole, which is
    // worth saying plainly even when other steps name episodes.
    if (item.ep_start == null && item.ep_end == null) {
      entry.whole = true;
    } else {
      entry.ranges.push(formatRange(item.ep_start, item.ep_end));
    }
    entry.count += 1;
    index.set(key, entry);
  }
  return index;
}

// "1-2", or words when only one bound is set: a step can legitimately say
// "from ep 5 on" without knowing where the entry stops. Spelled out rather
// than left as a bare dash, since "–3" reads as minus three.
function formatRange(start, end) {
  if (start != null && end != null) {
    return start === end ? `${start}` : `${start}–${end}`;
  }
  if (start != null) return `${start} onward`;
  return `up to ${end}`;
}

// The badge text for one candidate, or null when it is not in the list yet.
function addedLabel(added) {
  if (!added) return null;
  if (added.whole || !added.ranges.length) return "Added";
  return `Added · Ep ${added.ranges.join(", ")}`;
}

function EntryPicker({ candidates, items, onAdd, disabled, target, onClearTarget }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const auth = useAuth();
  const [hideAdded, setHideAdded] = useState(false);

  const added = useMemo(() => buildAddedIndex(items), [items]);

  // How many of the franchise's entries are already in the list, whatever the
  // search box currently shows - the toggle offering to hide them should say
  // the same number before and after it is ticked.
  const addedCount = useMemo(
    () =>
      candidates.filter((c) => added.has(`${c.media_type}:${c.entry_id}`))
        .length,
    [candidates, added]
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (
      candidates
        .filter((c) => !type || c.media_type === type)
        .filter(
          (c) => !hideAdded || !added.has(`${c.media_type}:${c.entry_id}`)
        )
        // search_names carries every title the entry answers to, already
        // lowercased by the backend. display_name is one of them, but an entry
        // saved before the field existed may arrive without it, so the displayed
        // name is still checked on its own.
        .filter(
          (c) =>
            !q ||
            (c.display_name || "").toLowerCase().includes(q) ||
            (c.search_names || []).some((n) => n.includes(q))
        )
        .slice(0, 40)
    );
  }, [candidates, query, type, hideAdded, added]);

  return (
    <Slip title="Add entries">
      {/*
        Says where the next pick lands. Without it "Add entry to this part"
        would scroll the admin to a picker that looks exactly like the one that
        files nothing, and the part would be silently forgotten.
      */}
      {target && (
        <div className="flex items-center gap-2 mb-2 px-2 py-1.5 bg-brand-soft border border-brand">
          <Eyebrow as="span" className="text-brand truncate">
            Adding to {target.section_name || "Untitled Section"}
          </Eyebrow>
          <Button kind="ghost" size="sm" className="ml-auto" onClick={onClearTarget}>
            Add outside any part
          </Button>
        </div>
      )}
      <div className="flex flex-wrap gap-2 mb-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search entries to add, in any language"
          className="flex-1 min-w-[12rem] px-3 py-1.5 text-sm border border-border-strong bg-surface text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="px-2 py-1.5 text-xs border border-border-strong bg-surface text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <option value="">All types</option>
          {Object.entries(TYPE_LABELS)
            .filter(([slug]) => canSeeGatedType(auth, slug))
            .map(([slug, label]) => (
            <option key={slug} value={slug}>
              {label}
            </option>
          ))}
        </select>

        {/*
          Only worth offering once something would actually be hidden. Sits in
          the search row because it narrows the same result set the box does.
        */}
        {addedCount > 0 && (
          <label className="inline-flex items-center gap-1.5 text-xs text-text-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideAdded}
              onChange={(e) => setHideAdded(e.target.checked)}
              className="accent-brand"
            />
            Hide added ({addedCount})
          </label>
        )}
      </div>

      {matches.length === 0 ? (
        <p className="text-xs text-text-muted py-2">
          {/*
            With the toggle on, an empty result usually means there is nothing
            left to add rather than nothing matching what was typed.
          */}
          {hideAdded && !query.trim()
            ? "Every entry in scope is already in this order."
            : "No entries match."}
        </p>
      ) : (
        <ul className="flex flex-col max-h-64 overflow-y-auto border border-border divide-y divide-border">
          {matches.map((c) => {
            const key = `${c.media_type}:${c.entry_id}`;
            const label = addedLabel(added.get(key));
            return (
            <li key={key}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onAdd(c)}
                className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-surface-2 text-left disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <span className="font-mono text-[10px] text-brand" aria-hidden="true">+</span>
                <span className="text-sm text-text truncate">
                  {c.display_name}
                </span>
                {/*
                  Specials often share their parent's title, so the episode
                  number is the only thing telling two rows apart here.
                */}
                {specialLabel(c) && (
                  <Chip className="shrink-0">{specialLabel(c)}</Chip>
                )}
                {/*
                  Two entries in a franchise often share a title beyond the
                  season number, so the release date is what tells them apart
                  at a glance - and it is the thing being ordered by.
                */}
                {c.release_display && (
                  <span className="shrink-0 font-mono text-[10px] text-text-faint whitespace-nowrap">
                    {c.release_display}
                  </span>
                )}
                {/*
                  Information, not a block: the button stays enabled, because
                  adding the same entry twice is how a split run is written.
                */}
                {label && (
                  <Chip tone="muted" className="shrink-0">{label}</Chip>
                )}
                <Eyebrow as="span" className="ml-auto whitespace-nowrap">
                  {TYPE_LABELS[c.media_type]}
                </Eyebrow>
              </button>
            </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-text-faint mt-2">
        The same entry can be added more than once — that is how a split run
        (ep 1–10, then later ep 11–12) is written.
      </p>
    </Slip>
  );
}

/**
 * One part, drawn as the box its steps live inside.
 *
 * Replaces the old arrangement, where parts were edited in a panel of their
 * own and each step carried a "which part?" dropdown. A step's part is now
 * shown by which box contains it and changed by moving it there, so the two
 * can never disagree — and the box is what the admin drags a step into.
 */
function PartBox({
  section,
  count,
  busy,
  onPatch,
  onRemove,
  onMove,
  onAddHere,
  registerHandle,
  readOnly = false,
  children,
}) {
  const drag = useDraggable({
    id: dragId.part(section.system_id),
    data: { type: "part", sectionId: section.system_id },
    disabled: readOnly || busy,
  });
  const drop = useDroppable({
    id: dropId.part(section.system_id),
    data: { type: "part", sectionId: section.system_id },
    disabled: readOnly,
  });
  const [name, setName] = useState(section.section_name ?? "");
  const [remark, setRemark] = useState(section.remark ?? "");

  useEffect(() => {
    setName(section.section_name ?? "");
    setRemark(section.remark ?? "");
  }, [section.section_name, section.remark]);

  return (
    <section
      ref={(el) => {
        drag.setNodeRef(el);
        drop.setNodeRef(el);
      }}
      style={dragStyle(drag)}
      className={`border border-border-strong bg-surface ${
        drag.isDragging ? "relative z-10 opacity-80" : ""
      } ${drop.isOver && !drag.isDragging ? "ring-2 ring-brand" : ""}`}
    >
      <header className="px-3 py-2 border-b border-border flex flex-wrap items-center gap-2">
        {/*
          Moves the whole part - every step in it, in one commit. A part is a
          block, so there is no such thing as moving its heading past its own
          steps.
        */}
        {!readOnly && (
          <Grip
            label={`part ${section.section_name || "Untitled Section"}`}
            drag={drag}
            busy={busy}
            onStep={onMove}
            registerHandle={registerHandle}
          />
        )}
        <Eyebrow as="span" className="shrink-0">Part</Eyebrow>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => onPatch(section.system_id, { section_name: name })}
          placeholder="Part name"
          className="flex-1 min-w-[140px] px-2 py-1 text-xs font-medium border border-border-strong bg-surface text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <input
          type="text"
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          onBlur={() => onPatch(section.system_id, { remark })}
          placeholder="Part note"
          className="flex-1 min-w-[140px] px-2 py-1 text-xs border border-border-strong bg-surface text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <Eyebrow as="span" className="whitespace-nowrap">
          {count}
          {count === 1 ? " step" : " steps"}
        </Eyebrow>
        <div className="flex items-center gap-1">
          {/*
            Deletes the part, never its steps: the FK is SET NULL, so they stay
            in the order and simply become unfiled where they already sit.
          */}
          <button
            type="button"
            disabled={busy}
            onClick={() => onRemove(section.system_id)}
            title="Delete part (its steps stay, unfiled)"
            aria-label="Delete part"
            className="w-7 h-7 inline-flex items-center justify-center border border-border-strong text-text-muted hover:text-danger hover:border-danger disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <i className="fas fa-trash text-xs"></i>
          </button>
        </div>
      </header>

      <div className="p-2 flex flex-col gap-2">
        {count === 0 ? (
          <p className="text-xs text-text-muted text-center py-3 border border-dashed border-border-strong">
            Empty part — drag a step in, or add one below.
          </p>
        ) : (
          children
        )}
        <Button
          kind="outline"
          size="sm"
          disabled={busy}
          onClick={() => onAddHere(section)}
          className="self-start"
        >
          Add entry to this part
        </Button>
      </div>
    </section>
  );
}

/**
 * The gap between two blocks, and a drop target in its own right.
 *
 * Dropping here unfiles a step. Without it a step could never be placed
 * *between* two parts: dropping onto a row adopts that row's part, so every
 * landing spot would belong to one part or another.
 */
function UnfileGap({ index }) {
  const { active } = useDndContext();
  const { setNodeRef, isOver } = useDroppable({
    id: dropId.gap(index),
    data: { type: "gap", blockIndex: index },
  });
  const open = Boolean(active) && isOver;
  // A part dropped here simply moves here; only a step is unfiled by it.
  const isPart = active?.data.current?.type === "part";
  return (
    <div
      ref={setNodeRef}
      className={`h-2 -my-1 transition-colors ${
        open ? "h-8 my-0 border border-dashed border-brand bg-brand-soft" : ""
      }`}
    >
      {open && (
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-brand text-center leading-7">
          {isPart ? "Drop here to move the part here" : "Drop here to leave it out of any part"}
        </p>
      )}
    </div>
  );
}


export default function WatchOrderEditor({ listId, onListChanged }) {
  const { showToast } = useToast();

  const [list, setList] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // How many writes are in flight, counted synchronously. `busy` is what the
  // page draws, but it lands a render late, and two key presses in one tick
  // would both read it as false; a move checks this instead, so a second move
  // is refused until the first is saved and an older response can never
  // overwrite a newer order.
  const inFlight = useRef(0);
  const sensors = useDragSensors();
  // Grips by key ("item:<id>" / "part:<id>"), so a keyboard move can put focus
  // back on the grip it moved - the row usually remounts in another block.
  const handles = useRef(new Map());
  const focusAfterMove = useRef(null);
  // Which part the picker files new entries into, or null for none. Set by a
  // part's own "Add entry to this part" button.
  const [addTarget, setAddTarget] = useState(null);

  const loadList = useCallback(() => {
    if (!listId) return;
    setLoading(true);
    fetch(endpoints.watchOrder.list(listId), { credentials: "include" })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.statusText)))
      .then(setList)
      .catch(() => showToast("error", "Could not load that watch order."))
      .finally(() => setLoading(false));
  }, [listId, showToast]);

  useEffect(loadList, [loadList]);

  // Candidates depend on the owner, so they reload only when the owner changes.
  useEffect(() => {
    if (!list) return;
    fetch(
      buildUrl(endpoints.watchOrder.candidates(), {
        franchise_id: list.franchise_id,
        collection_id: list.collection_id,
      }),
      { credentials: "include" }
    )
      .then((res) => (res.ok ? res.json() : []))
      .then(setCandidates)
      .catch(() => setCandidates([]));
  }, [list?.franchise_id, list?.collection_id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const key = focusAfterMove.current;
    if (key == null) return;
    focusAfterMove.current = null;
    handles.current.get(key)?.focus();
  });

  const registerHandle = (key) => (el) => {
    if (el) handles.current.set(key, el);
    else handles.current.delete(key);
  };

  async function send(url, method, body) {
    inFlight.current += 1;
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        credentials: "include",
        ...(body ? jsonBody(body) : {}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || res.statusText);
      }
      return res;
    } finally {
      inFlight.current -= 1;
      if (inFlight.current === 0) setBusy(false);
    }
  }

  /*
   * Every handler below folds the server's response into local state instead of
   * calling loadList(). Refetching flipped `loading` back on, which replaced
   * the whole editor with a one-line spinner - the page collapsed, the browser
   * scrolled to the top, and the entry picker lost whatever was typed in it.
   * loadList() now runs only on mount and to recover from a failed write.
   */

  async function patchList(patch) {
    try {
      const res = await send(
        endpoints.watchOrder.patchList(listId),
        "PATCH",
        patch
      );
      const updated = await res.json();
      // The response carries no items, so keep the ones already in hand.
      setList((prev) => ({ ...prev, ...updated, items: prev.items }));
      onListChanged?.();
    } catch (e) {
      showToast("error", e.message);
      loadList();
    }
  }

  async function addItem(candidate) {
    try {
      const res = await send(endpoints.watchOrder.createItem(listId), "POST", {
        media_type: candidate.media_type,
        entry_id: candidate.entry_id,
        section_id: addTarget?.system_id ?? null,
      });
      const created = await res.json();
      // The create response holds no display data, but the picked candidate
      // does - and in the same shape the resolver returns - so the new row can
      // be appended fully formed rather than fetched back.
      const resolved = {
        ...created,
        missing: false,
        display_name: candidate.display_name,
        release_display: candidate.release_display ?? null,
        cover_image_file: candidate.cover_image_file,
        cover_image_focus: candidate.cover_image_focus ?? null,
        franchise_id: candidate.franchise_id,
        status: candidate.status ?? null,
        total_episodes: candidate.total_episodes ?? null,
        ep_special: candidate.ep_special ?? null,
      };
      // A step added to a part lands at the end of *that part*, not the end of
      // the list, so it is spliced in by the position the server gave it
      // rather than pushed onto the tail.
      setList((prev) => {
        const items = [...prev.items];
        const at = items.findIndex(
          (i) => (i.position ?? Infinity) > (resolved.position ?? Infinity)
        );
        items.splice(at === -1 ? items.length : at, 0, resolved);
        return {
          ...prev,
          items,
          item_count: (prev.item_count ?? prev.items.length) + 1,
        };
      });
      onListChanged?.();
    } catch (e) {
      showToast("error", e.message);
      loadList();
    }
  }

  async function patchItem(itemId, patch) {
    try {
      const res = await send(
        endpoints.watchOrder.patchItem(itemId),
        "PATCH",
        patch
      );
      const updated = await res.json();
      setList((prev) => ({
        ...prev,
        items: prev.items.map((i) =>
          // The response omits the resolved display fields entirely, so
          // spreading it over the old item leaves them intact.
          i.system_id === itemId ? { ...i, ...updated } : i
        ),
      }));
    } catch (e) {
      showToast("error", e.message);
      loadList();
    }
  }

  async function addSection() {
    try {
      const res = await send(endpoints.watchOrder.createSection(listId), "POST", {
        section_name: `Part ${sections.length + 1}`,
      });
      const created = await res.json();
      setList((prev) => ({ ...prev, sections: [...(prev.sections || []), created] }));
    } catch (e) {
      showToast("error", e.message);
    }
  }

  async function patchSection(sectionId, patch) {
    try {
      const res = await send(
        endpoints.watchOrder.patchSection(sectionId),
        "PATCH",
        patch
      );
      const updated = await res.json();
      setList((prev) => ({
        ...prev,
        sections: (prev.sections || []).map((s) =>
          s.system_id === sectionId ? { ...s, ...updated } : s
        ),
      }));
    } catch (e) {
      showToast("error", e.message);
      loadList();
    }
  }

  async function removeSection(sectionId) {
    try {
      await send(endpoints.watchOrder.removeSection(sectionId), "DELETE");
      // The steps survive — the FK is SET NULL — so they are unfiled here
      // rather than dropped, matching what the server just did.
      setList((prev) => ({
        ...prev,
        sections: (prev.sections || []).filter((s) => s.system_id !== sectionId),
        items: (prev.items || []).map((i) =>
          i.section_id === sectionId ? { ...i, section_id: null } : i
        ),
      }));
      onListChanged?.();
    } catch (e) {
      showToast("error", e.message);
      loadList();
    }
  }

  async function removeItem(itemId) {
    try {
      await send(endpoints.watchOrder.removeItem(itemId), "DELETE");
      setList((prev) => ({
        ...prev,
        items: prev.items.filter((i) => i.system_id !== itemId),
        item_count: Math.max((prev.item_count ?? prev.items.length) - 1, 0),
      }));
      onListChanged?.();
    } catch (e) {
      showToast("error", e.message);
      loadList();
    }
  }

  const sections = list?.sections || [];

  // What the page draws: part boxes and the loose runs between them, folded
  // out of the flat step list the server returns in reading order. Empty parts
  // are included here and not in the guide — an admin has to be able to drop
  // the first step into a part they just made.
  const blocks = useMemo(
    () => buildBlocks(list?.items, list?.sections, { includeEmpty: true }),
    [list?.items, list?.sections]
  );

  /**
   * Commits a token stream as ONE reorder request: the step order, each
   * step's part and every part's position travel together, so a move - a
   * whole part included - either lands entirely or not at all.
   *
   * Returns false when the move was refused or changes nothing, so the typed
   * position box knows to put its number back.
   */
  function commitTokens(tokens, focusKey) {
    if (!tokens || inFlight.current > 0) return false;
    const payload = orderPayload(tokens, sections);
    if (focusKey?.startsWith("item:") && changesNothing(list.items, payload)) {
      return false;
    }
    focusAfterMove.current = focusKey ?? null;
    // Optimistic: reorder locally first so the row doesn't visibly snap back
    // while the request is in flight.
    setList({ ...list, items: payload.items, sections: payload.sections });
    (async () => {
      try {
        const res = await send(endpoints.watchOrder.reorder(listId), "PUT", payload.body);
        setList(await res.json());
        onListChanged?.();
      } catch (e) {
        showToast("error", e.message);
        loadList();
      }
    })();
    return true;
  }

  const tokens = () => buildTokens(blocks);

  /**
   * Moves one step to flat index `to` - the typed box, the arrow keys on its
   * grip, and a drop onto another row. `section` names the part it lands in
   * when the gesture says so (a drop onto a row takes that row's part) and is
   * left undefined by the box and the keys, which infer it from the new
   * neighbours, so a step nudged past the end of its part leaves it.
   */
  function moveItem(from, to, section) {
    if (!list || inFlight.current > 0) return false;
    const moved = list.items[from];
    if (!moved) return false;
    return commitTokens(
      moveStepByIndex(tokens(), sections, from, to, section),
      `item:${moved.system_id}`
    );
  }

  /** Moves a whole part, steps and all, to block index `to`. */
  function movePart(blockIndex, to) {
    if (!list || inFlight.current > 0) return false;
    const block = blocks[blockIndex];
    return commitTokens(
      moveBlock(blocks, blockIndex, to),
      `part:${block.section.system_id}`
    );
  }

  const blockOfItem = (itemId) =>
    blocks.findIndex((b) => b.rows.some((r) => r.item.system_id === itemId));
  const blockOfPart = (sectionId) =>
    blocks.findIndex(
      (b) => b.kind === "part" && b.section.system_id === sectionId
    );

  /**
   * One drop, by what was dragged and what it landed on.
   *
   * A step dropped
   *  - on a row takes that row's slot and that row's part (or none);
   *  - on a part's own chrome joins the end of that part, or becomes the
   *    first step of an empty one, where that part is drawn;
   *  - in a gap between blocks is unfiled there - the only way to put a step
   *    between two parts.
   *
   * A part dropped on a block (its box, or any row in it) takes that block's
   * place; dropped in a gap it moves to that gap.
   */
  function onDragEnd({ active, over }) {
    if (!over || inFlight.current > 0) return;
    const dragged = active.data.current;
    const target = over.data.current;
    if (!dragged || !target) return;

    if (dragged.type === "item") {
      const from = list.items.findIndex((i) => i.system_id === dragged.itemId);
      if (from < 0) return;
      if (target.type === "row") {
        const to = list.items.findIndex((i) => i.system_id === target.itemId);
        if (to < 0 || to === from) return;
        moveItem(from, to, list.items[to].section_id || null);
      } else if (target.type === "part") {
        commitTokens(
          moveStepIntoPart(tokens(), sections, dragged.itemId, target.sectionId),
          `item:${dragged.itemId}`
        );
      } else if (target.type === "gap") {
        commitTokens(
          moveStepIntoGap(tokens(), sections, blocks, dragged.itemId, target.blockIndex),
          `item:${dragged.itemId}`
        );
      }
      return;
    }

    if (dragged.type === "part") {
      const from = blockOfPart(dragged.sectionId);
      if (from < 0) return;
      let to;
      if (target.type === "gap") {
        // The gap before block g: removing the part first shifts every block
        // below it up one.
        to = target.blockIndex > from ? target.blockIndex - 1 : target.blockIndex;
      } else if (target.type === "part") {
        to = blockOfPart(target.sectionId);
      } else {
        to = blockOfItem(target.itemId);
      }
      if (to >= 0 && to !== from) movePart(from, to);
    }
  }

  if (!listId) {
    return (
      <div className="text-center py-16 border border-dashed border-border-strong">
        <p className="text-sm text-text-muted">Pick a watch order to edit.</p>
      </div>
    );
  }

  const isBuiltIn = Boolean(list?.auto_source);

  if (loading || !list) {
    return (
      <div className="py-16 text-center text-text-faint" aria-busy="true">
        <i className="fas fa-circle-notch fa-spin text-2xl" aria-label="Loading"></i>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/*
        The editor has no title for the scope to lead, so it leads the panel
        instead - a band above the fields rather than a line floating between
        the checkboxes and the picker.
      */}
      {list.media_types?.length > 0 && (
        <div className="-mx-4 -mt-4 px-4 py-2 border-b border-border bg-surface-2">
          <MediaScopeLine mediaTypes={list.media_types} />
        </div>
      )}

      {/* Order metadata */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Eyebrow as="label">Name</Eyebrow>
          <input
            type="text"
            defaultValue={list.list_name || ""}
            key={`name-${list.system_id}`}
            onBlur={(e) =>
              e.target.value !== (list.list_name || "") &&
              patchList({ list_name: e.target.value })
            }
            className="mt-1 w-full px-3 py-1.5 text-sm font-medium border border-border-strong bg-surface text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>

        <div>
          <Eyebrow as="label">Type</Eyebrow>
          <select
            value={list.list_type || "Custom"}
            onChange={(e) => patchList({ list_type: e.target.value })}
            className="mt-1 w-full px-3 py-1.5 text-sm border border-border-strong bg-surface text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-brand"
          >
            {LIST_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <Eyebrow as="label">Note</Eyebrow>
          <textarea
            defaultValue={list.remark || ""}
            key={`remark-${list.system_id}`}
            rows={2}
            onBlur={(e) =>
              e.target.value !== (list.remark || "") &&
              patchList({ remark: e.target.value })
            }
            placeholder="How this order should be read"
            className="mt-1 w-full px-3 py-1.5 text-sm resize-none border border-border-strong bg-surface text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <label className="inline-flex items-center gap-2 text-xs text-text-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={!!list.is_default}
            onChange={(e) => patchList({ is_default: e.target.checked })}
            className="accent-brand"
          />
          Show this order first
        </label>

        {/*
          Independent of the flag above: several orders can be recommended, and
          this marks the single one to actually follow. Setting it clears the
          flag on the owner's other orders.
        */}
        <label className="inline-flex items-center gap-2 text-xs text-text-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={!!list.is_most_recommended}
            onChange={(e) =>
              patchList({ is_most_recommended: e.target.checked })
            }
            className="accent-brand"
          />
          Most recommended
        </label>
      </div>

      {/*
        A built-in list has no stored steps to add to or reorder, so the
        controls are replaced by an explanation rather than left to fail.
      */}
      {isBuiltIn ? (
        <p className="text-xs text-text-muted bg-surface-2 border border-border px-3 py-2">
          These steps are generated from release dates and refresh on their own
          as entries are added. The name, type, note and flags above are still
          yours to edit.
        </p>
      ) : (
        <EntryPicker
          candidates={candidates}
          items={list.items}
          onAdd={addItem}
          disabled={busy}
          target={addTarget}
          onClearTarget={() => setAddTarget(null)}
        />
      )}

      {/*
        Parts are edited where they live. A step's part is shown by which box
        contains it and changed by moving it there — there is no separate
        panel, and no per-step "which part?" dropdown that could disagree with
        what the page draws.
      */}
      {list.items.length === 0 && sections.length === 0 ? (
        <p className="text-center py-8 text-sm text-text-muted border border-dashed border-border-strong">
          No steps yet — add entries above.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={innermostUnderPointer}
          modifiers={[lockToVerticalAxis]}
          // Re-measured continuously: the gap under the pointer opens up as
          // it is hovered, which moves every target below it.
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          accessibility={{ screenReaderInstructions: SCREEN_READER }}
          onDragEnd={onDragEnd}
        >
          <div className="flex flex-col gap-2">
            {blocks.map((block, blockIndex) => {
              const gapBefore = !isBuiltIn && (
                <UnfileGap key={`gap-${blockIndex}`} index={blockIndex} />
              );

              const rows = block.rows.map((row) => (
                <ItemRow
                  key={row.item.system_id}
                  item={row.item}
                  index={row.number}
                  readOnly={isBuiltIn}
                  busy={busy}
                  total={list.items.length}
                  onPatch={patchItem}
                  onRemove={removeItem}
                  onMove={moveItem}
                  registerHandle={registerHandle(`item:${row.item.system_id}`)}
                />
              ));

              if (block.kind === "part") {
                return (
                  <Fragment key={block.key}>
                    {gapBefore}
                    <PartBox
                      section={block.section}
                      count={block.rows.length}
                      busy={busy}
                      onPatch={patchSection}
                      onRemove={removeSection}
                      onMove={(direction) => movePart(blockIndex, blockIndex + direction)}
                      onAddHere={setAddTarget}
                      registerHandle={registerHandle(`part:${block.section.system_id}`)}
                      readOnly={isBuiltIn}
                    >
                      {rows}
                    </PartBox>
                  </Fragment>
                );
              }

              return (
                <Fragment key={block.key}>
                  {gapBefore}
                  <div className="flex flex-col gap-2">{rows}</div>
                </Fragment>
              );
            })}

            {/* The tail gap, so a step can be dropped past the last part. */}
            {!isBuiltIn && blocks.length > 0 && <UnfileGap index={blocks.length} />}
          </div>
        </DndContext>
      )}

      {!isBuiltIn && (
        <Button
          kind="outline"
          size="sm"
          disabled={busy}
          onClick={addSection}
          className="self-start"
        >
          Add part
        </Button>
      )}

    </div>
  );
}
