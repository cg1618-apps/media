// Frontend: modify tab page file for Fav3x3ModifyTab.
//
// One editor per favourite grid. A grid holds franchises, series or entries
// (see config/favoriteGrids.js) and this file is deliberately tier-blind:
// everything that differs between the three is answered by the favorite*
// helpers in utils/statsUtils, so a new grid is a config entry and nothing
// here changes.
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { DndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useDragSensors } from "../../components/ui/Sortable";
import { MEDIA_CONFIG } from "../../utils/media";
import { FALLBACK_SVG, NO_COVER, focusStyle } from "../../lib/covers";
import {
  favoriteCover,
  favoriteName,
  favoriteOptions,
  favoriteSearchNames,
  slotIn,
} from "../../utils/statsUtils";
import { visibleFavoriteGrids } from "../../config/favoriteGrids";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";

const SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

// Which entry list a grid's rows live in, and so which endpoint saves one.
// A franchise and a series name their own list; an entry grid names its type.
function listTypeFor(grid) {
  return grid.tier === "entry" ? grid.entryType : grid.tier;
}

function computeOriginal(rows, grid) {
  const original = {};
  rows.forEach((row) => {
    const slot = slotIn(row, grid);
    if (slot !== null) original[String(slot)] = row.system_id;
  });
  return original;
}

/**
 * The draft after the rows in two slots trade places. A swap, not an insert:
 * nothing else in the grid moves. Either slot may be empty, in which case the
 * other row moves into it and leaves its own slot empty.
 */
export function swapSlots(draft, fromSlot, toSlot) {
  if (fromSlot === toSlot) return draft;
  const next = { ...draft };
  const from = next[String(fromSlot)];
  const to = next[String(toSlot)];
  if (to) next[String(fromSlot)] = to;
  else delete next[String(fromSlot)];
  if (from) next[String(toSlot)] = from;
  else delete next[String(toSlot)];
  return next;
}

function cleanStr(s) {
  if (!s) return "";
  return s.toLowerCase().replace(/[\s\-:;,.'"!?()[\]{}<>~`+*&^%$#@!\\/|]/g, "");
}

function RowPickerModal({
  slot,
  grid,
  currentRowId,
  options,
  coverFor,
  onSelect,
  onClear,
  onClose,
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = cleanStr(query);
    return options.filter((row) =>
      favoriteSearchNames(row).some((name) => cleanStr(name).includes(q)),
    );
  }, [query, options]);

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h3 className="text-sm font-black text-text">
            Assign to Slot {slot}
            <span className="text-text-faint font-medium ml-2">
              — {grid.title}
            </span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-text-faint hover:text-text-muted transition text-lg leading-none"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-border shrink-0">
          <div className="relative">
            <i className="fas fa-search absolute left-3 top-2.5 text-text-faint text-sm"></i>
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${grid.tier}...`}
              className="w-full pl-9 pr-4 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        </div>

        {/* Candidates */}
        <div className="overflow-y-auto flex-1 p-4">
          {filtered.length === 0 ? (
            <p className="text-center text-text-faint text-sm font-medium py-8">
              Nothing found
            </p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
              {filtered.map((row) => {
                const isSelected = row.system_id === currentRowId;
                const name = favoriteName(row, grid);
                const cover = coverFor(row);
                return (
                  <button
                    key={row.system_id}
                    type="button"
                    onClick={() => onSelect(row.system_id)}
                    className={`group flex flex-col focus:outline-none rounded-xl overflow-hidden border-2 transition-all ${
                      isSelected
                        ? "border-brand shadow-md"
                        : "border-transparent hover:border-brand/50"
                    }`}
                  >
                    <div className="relative rounded-t-xl overflow-hidden bg-surface-2">
                      <div className="aspect-[3/4]">
                        <img
                          loading="lazy"
                          src={cover.url}
                          alt={name}
                          className="w-full h-full object-cover"
                          style={focusStyle(cover.focus)}
                          onError={(e) => {
                            e.target.src = FALLBACK_SVG;
                          }}
                        />
                      </div>
                      {isSelected && (
                        <div className="absolute inset-0 bg-brand/20 flex items-center justify-center">
                          <i className="fas fa-check-circle text-brand text-xl"></i>
                        </div>
                      )}
                    </div>
                    <div className="px-1 py-1.5 bg-surface">
                      <p className="text-[10px] font-bold text-text-muted truncate leading-tight">
                        {name}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {currentRowId && (
          <div className="px-5 py-3 border-t border-border shrink-0">
            <button
              type="button"
              onClick={onClear}
              className="flex items-center gap-1.5 text-xs font-bold text-danger hover:text-danger transition"
            >
              <i className="fas fa-times-circle text-xs"></i>
              Clear slot
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SlotCard({ slot, name, cover, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(slot)}
      className="group flex flex-col w-full text-left focus:outline-none"
    >
      <div className="relative rounded-xl overflow-hidden border border-border shadow-sm bg-surface-2 group-hover:border-brand transition-colors">
        <div className="aspect-[3/4]">
          <img
            loading="lazy"
            src={cover.url}
            alt={name || ""}
            className="w-full h-full object-cover"
            style={focusStyle(cover.focus)}
            onError={(e) => {
              e.target.src = FALLBACK_SVG;
            }}
          />
        </div>
        {/* Hover edit overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
          <i className="fas fa-edit text-white text-base opacity-0 group-hover:opacity-100 transition-opacity"></i>
        </div>
        {/* Slot badge */}
        <div className="absolute top-1.5 left-1.5 w-5 h-5 bg-black/60 rounded-md flex items-center justify-center">
          <span className="text-white text-[10px] font-black">{slot}</span>
        </div>
        {name ? (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-1.5 pt-4 pb-1.5">
            <p className="text-white text-[10px] font-bold leading-tight truncate">
              {name}
            </p>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-black text-text-faint/60">{slot}</span>
            <span className="text-[10px] text-text-faint/60 font-medium mt-1">
              Empty
            </span>
          </div>
        )}
      </div>
    </button>
  );
}

// One row of the ranked list. The whole row is both what is picked up and
// what is dropped on: it holds no inputs, and the 4px activation distance of
// useDragSensors keeps a plain click from starting a drag. It is dnd-kit's
// pointer drag rather than native HTML5 drag, because a native drag swallows
// the mouse wheel on Windows; this way the page keeps scrolling while a row is
// held. ArrowUp / ArrowDown on a focused row swaps it with its neighbour,
// which is the keyboard path.
function RankListItem({ slot, name, cover, onKeySwap, registerRow }) {
  const drag = useDraggable({ id: slot });
  const drop = useDroppable({ id: slot });
  const { attributes, listeners, transform, isDragging } = drag;
  const isDragOver = drop.isOver && !isDragging;

  const ref = (el) => {
    drag.setNodeRef(el);
    drop.setNodeRef(el);
    registerRow(slot, el);
  };

  const onKeyDown = (e) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    onKeySwap(slot, e.key === "ArrowUp" ? -1 : 1);
  };

  return (
    <div
      ref={ref}
      {...attributes}
      {...listeners}
      onKeyDown={onKeyDown}
      aria-label={`Slot ${slot}: ${name || "empty"}`}
      title="Drag onto another slot to swap (or focus and press ↑/↓)"
      style={{ transform: CSS.Translate.toString(transform) }}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
        isDragging ? "relative z-10 opacity-80 cursor-grabbing" : "cursor-grab"
      } ${
        isDragOver
          ? "border-brand bg-brand/10"
          : "border-border bg-surface hover:border-border-strong"
      }`}
    >
      <span className="text-text-faint/60 text-sm leading-none shrink-0">⠿</span>
      <span className="text-[11px] font-black text-text-faint w-4 shrink-0">
        {slot}
      </span>
      {name ? (
        <>
          <div className="w-7 h-9 rounded overflow-hidden shrink-0 border border-border">
            <img
              loading="lazy"
              src={cover.url}
              alt=""
              className="w-full h-full object-cover"
              style={focusStyle(cover.focus)}
              onError={(e) => {
                e.target.src = FALLBACK_SVG;
              }}
            />
          </div>
          <span className="text-xs font-bold text-text-muted truncate min-w-0">
            {name}
          </span>
        </>
      ) : (
        <span className="text-xs text-text-faint/60 font-medium italic">
          Empty
        </span>
      )}
    </div>
  );
}

const SWAP_INSTRUCTIONS = {
  draggable:
    "Drag onto another slot to swap the two, or press the up and down arrow keys to swap with the neighbouring slot.",
};

function GridEditor({
  grid,
  draft,
  options,
  coverFor,
  isDirty,
  onSlotChange,
  onSwap,
  onSave,
  saving,
}) {
  const [pickerSlot, setPickerSlot] = useState(null);
  const sensors = useDragSensors();
  const rowEls = useRef(new Map());
  const focusAfterSwap = useRef(null);

  // A keyboard swap carries the row's content to the neighbouring slot; move
  // focus with it so a held arrow key keeps carrying the same row.
  useEffect(() => {
    const slot = focusAfterSwap.current;
    if (slot == null) return;
    focusAfterSwap.current = null;
    rowEls.current.get(slot)?.focus();
  });

  const registerRow = useCallback((slot, el) => {
    if (el) rowEls.current.set(slot, el);
    else rowEls.current.delete(slot);
  }, []);

  const swapByKey = (slot, delta) => {
    const target = slot + delta;
    if (!SLOTS.includes(target)) return;
    focusAfterSwap.current = target;
    onSwap(grid, slot, target);
  };

  // Each grid has its own DndContext, so a row can only be dropped within
  // the grid it came from.
  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    onSwap(grid, active.id, over.id);
  };

  const rowById = useMemo(() => {
    const byId = {};
    options.forEach((row) => {
      byId[row.system_id] = row;
    });
    return byId;
  }, [options]);

  function slotRow(slot) {
    const id = draft[String(slot)];
    return id ? rowById[id] : null;
  }

  return (
    <section className="bg-surface rounded-2xl border border-border shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-black text-text flex items-center gap-2">
          {grid.title}
        </h2>
        {isDirty && (
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand text-on-brand rounded-lg text-xs font-black hover:bg-brand/90 transition disabled:opacity-60"
          >
            {saving ? (
              <i className="fas fa-spinner fa-spin text-xs"></i>
            ) : (
              <i className="fas fa-save text-xs"></i>
            )}
            Save Grid
          </button>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-5">
        {/* Left: 3×3 visual grid */}
        <div className="grid grid-cols-3 gap-2 max-w-xs shrink-0">
          {SLOTS.map((slot) => {
            const row = slotRow(slot);
            return (
              <SlotCard
                key={slot}
                slot={slot}
                name={row ? favoriteName(row, grid) : null}
                cover={row ? coverFor(row) : NO_COVER}
                onOpen={(s) => setPickerSlot(s)}
              />
            );
          })}
        </div>

        {/* Right: ranked drag list */}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black text-text-faint uppercase tracking-widest mb-2">
            Drag to reorder
          </p>
          <DndContext
            sensors={sensors}
            accessibility={{ screenReaderInstructions: SWAP_INSTRUCTIONS }}
            onDragEnd={onDragEnd}
          >
            <div className="space-y-1">
              {SLOTS.map((slot) => {
                const row = slotRow(slot);
                return (
                  <RankListItem
                    key={slot}
                    slot={slot}
                    name={row ? favoriteName(row, grid) : null}
                    cover={row ? coverFor(row) : NO_COVER}
                    onKeySwap={swapByKey}
                    registerRow={registerRow}
                  />
                );
              })}
            </div>
          </DndContext>
        </div>
      </div>

      {/* Row picker modal */}
      {pickerSlot !== null && (
        <RowPickerModal
          slot={pickerSlot}
          grid={grid}
          currentRowId={draft[String(pickerSlot)] || null}
          options={options}
          coverFor={coverFor}
          onSelect={(id) => {
            onSlotChange(grid, pickerSlot, id);
            setPickerSlot(null);
          }}
          onClear={() => {
            onSlotChange(grid, pickerSlot, null);
            setPickerSlot(null);
          }}
          onClose={() => setPickerSlot(null)}
        />
      )}
    </section>
  );
}

export default function Fav3x3ModifyTab({ lists, setList }) {
  const { showToast } = useToast();
  const [savingByGrid, setSavingByGrid] = useState({});
  // The two h-game grids only for a session that can see the gated type.
  const visibleGatedTypes = useAuth()?.visibleGatedTypes;
  const grids = useMemo(
    () => visibleFavoriteGrids({ visibleGatedTypes }),
    [visibleGatedTypes],
  );

  // Covers come from the entries hanging off a group, so both indexes are
  // built once here and shared by every grid.
  const { byFranchise, bySeries } = useMemo(() => {
    const entries = [
      ...(lists.anime || []).map((e) => ({ ...e, _type: "anime" })),
      ...(lists["anime-movie"] || []).map((e) => ({
        ...e,
        _type: "anime_movie",
      })),
      ...(lists.movie || []).map((e) => ({ ...e, _type: "movie" })),
      ...(lists["tv-show"] || []).map((e) => ({ ...e, _type: "tv_show" })),
      ...(lists.cartoon || []).map((e) => ({ ...e, _type: "cartoon" })),
      ...(lists.manga || []).map((e) => ({ ...e, _type: "manga" })),
      ...(lists.novel || []).map((e) => ({ ...e, _type: "novel" })),
      ...(lists.comic || []).map((e) => ({ ...e, _type: "comic" })),
      ...(lists.game || []).map((e) => ({ ...e, _type: "game" })),
      ...(lists["h-game"] || []).map((e) => ({ ...e, _type: "h_game" })),
    ];
    const group = (field) => {
      const grouped = {};
      entries.forEach((entry) => {
        const id = String(entry[field]);
        if (!grouped[id]) grouped[id] = [];
        grouped[id].push(entry);
      });
      return grouped;
    };
    return { byFranchise: group("franchise_id"), bySeries: group("series_id") };
  }, [lists]);

  const optionsByGrid = useMemo(
    () =>
      Object.fromEntries(
        grids.map((grid) => [
          grid.id,
          favoriteOptions(grid, {
            franchises: lists.franchise,
            series: lists.series,
            bySeries,
            entries: lists[grid.entryType],
          }),
        ]),
      ),
    [grids, lists, bySeries],
  );

  // What is saved, per grid, read back off the lists. The draft starts as a
  // copy of it and is compared against it to decide whether Save shows.
  const originalByGrid = useMemo(
    () =>
      Object.fromEntries(
        grids.map((grid) => [
          grid.id,
          computeOriginal(optionsByGrid[grid.id], grid),
        ]),
      ),
    [grids, optionsByGrid],
  );

  const [drafts, setDrafts] = useState(originalByGrid);

  const isDirtyByGrid = useMemo(
    () =>
      Object.fromEntries(
        grids.map((grid) => [
          grid.id,
          JSON.stringify(drafts[grid.id] || {}) !==
            JSON.stringify(originalByGrid[grid.id] || {}),
        ]),
      ),
    [grids, drafts, originalByGrid],
  );

  const handleSlotChange = useCallback((grid, slot, rowId) => {
    setDrafts((prev) => {
      const gridDraft = { ...prev[grid.id] };
      if (rowId) {
        // One row cannot hold two slots in one grid: its slot is a single
        // number in `type_slots`, so assigning it here vacates the old one.
        Object.keys(gridDraft).forEach((s) => {
          if (gridDraft[s] === rowId && s !== String(slot)) delete gridDraft[s];
        });
        gridDraft[String(slot)] = rowId;
      } else {
        delete gridDraft[String(slot)];
      }
      return { ...prev, [grid.id]: gridDraft };
    });
  }, []);

  const handleSwap = useCallback((grid, fromSlot, toSlot) => {
    if (fromSlot === toSlot) return;
    setDrafts((prev) => ({
      ...prev,
      [grid.id]: swapSlots(prev[grid.id] || {}, fromSlot, toSlot),
    }));
  }, []);

  async function handleSave(grid) {
    const draft = drafts[grid.id] || {};
    const newSlotByRow = {};
    Object.entries(draft).forEach(([slot, id]) => {
      if (id) newSlotByRow[id] = parseInt(slot, 10);
    });

    const listType = listTypeFor(grid);
    const rows = lists[listType] || [];
    const changed = rows.filter(
      (row) =>
        (row.type_slots?.[grid.key] ?? undefined) !==
        newSlotByRow[row.system_id],
    );
    if (changed.length === 0) return;

    setSavingByGrid((prev) => ({ ...prev, [grid.id]: true }));
    try {
      const endpoint = MEDIA_CONFIG[listType].apiEndpoint;
      const results = await Promise.all(
        changed.map((row) => {
          const slot = newSlotByRow[row.system_id];
          // Patch the whole map, not one key: `type_slots` is a single JSONB
          // column and the other grids' keys have to survive the write.
          const typeSlots = { ...(row.type_slots || {}) };
          if (slot) typeSlots[grid.key] = slot;
          else delete typeSlots[grid.key];
          return fetch(`${endpoint}/${row.system_id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type_slots: Object.keys(typeSlots).length ? typeSlots : null,
            }),
            credentials: "include",
          }).then((r) =>
            r.ok ? r.json() : Promise.reject(new Error("Save failed")),
          );
        }),
      );
      setList(
        listType,
        rows.map(
          (row) =>
            results.find((saved) => saved.system_id === row.system_id) || row,
        ),
      );
      showToast("success", "Saved.");
    } catch {
      showToast("error", "Save failed.");
    } finally {
      setSavingByGrid((prev) => ({ ...prev, [grid.id]: false }));
    }
  }

  return (
    <div className="space-y-6">
      {grids.map((grid) => (
        <GridEditor
          key={grid.id}
          grid={grid}
          draft={drafts[grid.id] || {}}
          options={optionsByGrid[grid.id]}
          coverFor={(row) => favoriteCover(row, grid, { byFranchise, bySeries })}
          isDirty={isDirtyByGrid[grid.id]}
          onSlotChange={handleSlotChange}
          onSwap={handleSwap}
          onSave={() => handleSave(grid)}
          saving={!!savingByGrid[grid.id]}
        />
      ))}
    </div>
  );
}
