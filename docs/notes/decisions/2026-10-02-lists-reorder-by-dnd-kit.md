# Every list reorders by dnd-kit drag

Every reorderable list reorders by dragging a grip, through
`components/ui/Sortable.jsx` or, for surfaces that are not one flat list,
dnd-kit's `useDraggable` / `useDroppable` with the same sensors.

- **Drag rather than up/down chevrons.** Arrows cost one click per place, and
  two ways to do one thing across the app is one too many.
- **dnd-kit's pointer events rather than native HTML5 drag.** A native drag
  swallows the mouse wheel on Windows: while a row is held the page does not
  scroll, so a row can only be dropped somewhere already on screen. With
  pointer events the page keeps scrolling mid-drag and dnd-kit re-measures.
- **The keyboard path stays.** ArrowUp / ArrowDown on a focused grip moves the
  row one place and focus follows it; it is also the path the tests drive.
- **A move that saves at once freezes its list until it settles.** The next
  payload is built from the current order, so a second move sent before the
  first lands would undo it. The new order shows immediately, the grips are
  disabled while the request is in flight, and a failure reloads the stored
  order.
- **A watch-order move is one request.** `PUT /lists/{id}/reorder` takes
  `section_positions` beside `item_ids` and `section_ids`, so a move lands
  entirely or not at all; renumbering parts 1..N separately cannot place an
  empty part between two steps.
- **The cost** is three dependencies (`@dnd-kit/core`, `@dnd-kit/sortable`,
  `@dnd-kit/utilities`).
