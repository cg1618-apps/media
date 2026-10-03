// Frontend: drag-to-reorder for a flat list - the one reorder control every
// list in the app uses.
//
// Built on dnd-kit's pointer events rather than native HTML5 drag, because a
// native drag swallows the mouse wheel on Windows: with dnd-kit the page keeps
// scrolling under the wheel while a row is held, and dnd-kit re-measures the
// rows as it does. A row is picked up only by its DragHandle, so inputs inside
// the row stay usable; the handle also moves its row one place with the
// ArrowUp / ArrowDown keys, which is the keyboard path (and what tests drive).
//
//   <SortableList ids={ids} onMove={(from, to) => ...}>
//     {rows.map((row, i) => (
//       <SortableItem key={ids[i]} id={ids[i]} className="flex gap-2">
//         <DragHandle label={row.name} />
//         ...
//       </SortableItem>
//     ))}
//   </SortableList>
//
// `ids` must be unique and in render order. Rows that have no server id yet
// can use their index (`row.system_id ?? \`new-${i}\``). `onMove(from, to)`
// fires once per drop or key press, with indexes into `ids`; the caller builds
// the new order, usually with `arrayMove`, which is re-exported here.
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export { arrayMove };

const ListContext = createContext(null);
const ItemContext = createContext(null);

// A press has to travel a few pixels before it becomes a drag, so a plain
// click on the handle (or a tap) does nothing.
const ACTIVATION = { distance: 4 };

const lockToVerticalAxis = ({ transform }) => ({ ...transform, x: 0 });

const SCREEN_READER = {
  draggable:
    "Drag to reorder, or press the up and down arrow keys to move one place.",
};

/** Pointer sensors shared by every drag surface, sortable or not. */
export function useDragSensors() {
  return useSensors(useSensor(PointerSensor, { activationConstraint: ACTIVATION }));
}

/**
 * The list. `layout="grid"` lets rows move in both directions (a tile grid);
 * the default locks the drag to the vertical axis. `disabled` freezes every
 * handle, for a list whose last move is still being saved.
 */
export function SortableList({
  ids,
  onMove,
  disabled = false,
  layout = "vertical",
  children,
}) {
  const sensors = useDragSensors();
  const handles = useRef(new Map());
  const focusAfterMove = useRef(null);

  // A keyboard move re-renders the row somewhere else; put focus on the
  // handle now at the row's new index so a held arrow key keeps moving the
  // same row. By index, not id: rows with index-based ids change id as they
  // move, so the moved row is only findable by where it landed.
  useEffect(() => {
    const index = focusAfterMove.current;
    if (index == null) return;
    focusAfterMove.current = null;
    handles.current.get(ids[index])?.focus();
  });

  const list = useMemo(
    () => ({
      ids,
      disabled,
      handles: handles.current,
      moveByKey(id, delta) {
        const from = ids.indexOf(id);
        const to = from + delta;
        if (disabled || from < 0 || to < 0 || to >= ids.length) return;
        focusAfterMove.current = to;
        onMove(from, to);
      },
    }),
    [ids, disabled, onMove],
  );

  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(active.id);
    const to = ids.indexOf(over.id);
    if (from >= 0 && to >= 0) onMove(from, to);
  };

  return (
    <ListContext.Provider value={list}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={layout === "grid" ? undefined : [lockToVerticalAxis]}
        accessibility={{ screenReaderInstructions: SCREEN_READER }}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={ids}
          strategy={layout === "grid" ? rectSortingStrategy : verticalListSortingStrategy}
          disabled={disabled}
        >
          {children}
        </SortableContext>
      </DndContext>
    </ListContext.Provider>
  );
}

/** One row. Renders `as` (default div) and carries the drag transform. */
export function SortableItem({
  id,
  as: Tag = "div",
  className = "",
  style,
  children,
  ...rest
}) {
  const sortable = useSortable({ id });
  const { setNodeRef, transform, transition, isDragging } = sortable;
  return (
    <ItemContext.Provider value={{ id, ...sortable }}>
      <Tag
        ref={setNodeRef}
        className={`${className} ${isDragging ? "relative z-10 opacity-80" : ""}`}
        style={{
          ...style,
          transform: CSS.Translate.toString(transform),
          transition,
        }}
        {...rest}
      >
        {children}
      </Tag>
    </ItemContext.Provider>
  );
}

/**
 * The grip a row is dragged by. `label` names the row for screen readers
 * ("Reorder Steam"). Must sit inside a SortableItem.
 */
export function DragHandle({ label = "entry", className = "" }) {
  const list = useContext(ListContext);
  const item = useContext(ItemContext);
  const { id, attributes, listeners, setActivatorNodeRef, isDragging } = item;

  const ref = (el) => {
    setActivatorNodeRef(el);
    if (el) list.handles.set(id, el);
    else list.handles.delete(id);
  };

  const onKeyDown = (e) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    list.moveByKey(id, e.key === "ArrowUp" ? -1 : 1);
  };

  return (
    <button
      type="button"
      ref={ref}
      {...attributes}
      {...listeners}
      onKeyDown={onKeyDown}
      disabled={list.disabled}
      aria-label={`Reorder ${label}`}
      title="Drag to reorder (or focus and press ↑/↓)"
      className={`shrink-0 touch-none select-none px-1 text-text-faint/60 hover:text-text-faint disabled:opacity-30 ${
        isDragging ? "cursor-grabbing" : "cursor-grab"
      } ${className}`}
    >
      <i className="fas fa-grip-vertical text-[11px]" aria-hidden="true" />
    </button>
  );
}
