// Frontend: the Resources tree - groups nesting to any depth, Markdown items
// inside them, and (for a manage.catalog holder) every control that edits it.
//
// Reading and editing are one component because they draw the same thing: an
// editor sees the reader's page with controls added, not a second layout.
//
// Moving is drag-and-drop on dnd-kit's pointer events, like every other reorder
// in the app (components/ui/Sortable.jsx), because a native HTML5 drag swallows
// the mouse wheel on Windows. A node is picked up only by its grip; dropping it
// on a row takes that row's slot within that row's parent, and dropping it on a
// group's body (or the top-level tail shown while dragging) appends it there.
// The innermost box under the pointer is the target, and a target the node may
// not enter - a group into its own subtree - is refused rather than handed to
// the box around it. The grip also moves its node one place among its siblings
// with ArrowUp / ArrowDown, and a "Move to" list moves it into another group,
// so neither kind of move needs a mouse.
//
// Every move becomes one PATCH /api/resources/reorder carrying the complete new
// child list of the parent the node lands in (lib/resourceTree.js builds it).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";

import ConfirmModal from "../modals/ConfirmModal";
import { Button, Eyebrow } from "../ui/primitives";
import { useDragSensors } from "../ui/Sortable";
import ResourceMarkdown from "./ResourceMarkdown";
import { useToast } from "../../hooks/useToast";
import {
  useCreateResource,
  useDeleteResource,
  usePatchResource,
  useReorderResources,
} from "../../api/mutations/useResourceMutations";
import {
  canDropInto,
  countByKind,
  findNode,
  flattenGroups,
  moveAmongSiblings,
  moveInto,
} from "../../lib/resourceTree";

const ICON_BTN =
  "w-7 h-7 inline-flex items-center justify-center border border-border-strong text-text-muted hover:text-text hover:border-text disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
const ICON_BTN_DANGER =
  "w-7 h-7 inline-flex items-center justify-center border border-border-strong text-text-muted hover:text-danger hover:border-danger disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
const INPUT_CLS =
  "w-full px-2 py-1.5 text-sm border border-border-strong bg-surface text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-brand";
const DROP_ACTIVE = "outline outline-2 outline-dashed outline-brand bg-brand-soft";

// Heading sizes by depth; the page title is the h1, so a top-level group is h2.
const HEADING_CLS = [
  "font-display text-xl font-semibold",
  "font-display text-lg font-semibold",
  "font-display text-base font-semibold",
  "font-display text-sm font-semibold",
];

const EditorContext = createContext(null);

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// An item's title is optional; its opening words name it instead.
const nodeLabel = (node) => node.title || (node.content || "").slice(0, 40) || "item";

// Rows and boxes nest - an item row sits inside its group's body, which sits
// inside the group around it - so the target is the smallest droppable the
// pointer is inside: the innermost one, as a native drop event would see it.
function innermostUnderPointer({ droppableContainers, droppableRects, pointerCoordinates }) {
  if (!pointerCoordinates) return [];
  const { x, y } = pointerCoordinates;
  let best = null;
  let bestArea = Infinity;
  for (const container of droppableContainers) {
    const rect = droppableRects.get(container.id);
    if (!rect) continue;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue;
    const area = rect.width * rect.height;
    if (area < bestArea) {
      best = container;
      bestArea = area;
    }
  }
  return best ? [{ id: best.id, data: { droppableContainer: best, value: bestArea } }] : [];
}

// Droppables are re-measured throughout a drag: the top-level tail appears only
// once a drag starts, and the page scrolls under the wheel mid-drag.
const MEASURING = { droppable: { strategy: MeasuringStrategy.Always } };

/**
 * Title (and, for an item, Markdown body) for a new or existing node. The
 * body has a Write / Preview switch so a link can be checked before saving.
 */
function NodeForm({ kind, initial = {}, submitLabel, busy, onSubmit, onCancel }) {
  const [title, setTitle] = useState(initial.title ?? "");
  const [content, setContent] = useState(initial.content ?? "");
  const [preview, setPreview] = useState(false);
  const isGroup = kind === "group";
  const valid = isGroup ? title.trim() !== "" : content.trim() !== "";

  const submit = (e) => {
    e.preventDefault();
    if (!valid) return;
    onSubmit(
      isGroup
        ? { title: title.trim() }
        : { title: title.trim() || null, content },
    );
  };

  return (
    <form
      onSubmit={submit}
      className="border border-brand bg-surface p-3 space-y-2"
      aria-label={isGroup ? "Group form" : "Item form"}
    >
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={isGroup ? "Group title" : "Title (optional)"}
        aria-label={isGroup ? "Group title" : "Item title"}
        autoFocus
        className={INPUT_CLS}
      />
      {!isGroup && (
        <>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setPreview(false)}
              aria-pressed={!preview}
              className={`px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] border ${
                preview
                  ? "border-border-strong text-text-muted"
                  : "border-brand bg-brand text-on-brand"
              }`}
            >
              Write
            </button>
            <button
              type="button"
              onClick={() => setPreview(true)}
              aria-pressed={preview}
              className={`px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] border ${
                preview
                  ? "border-brand bg-brand text-on-brand"
                  : "border-border-strong text-text-muted"
              }`}
            >
              Preview
            </button>
          </div>
          {preview ? (
            <div className="min-h-24 border border-border bg-surface-2 p-2">
              {content.trim() ? (
                <ResourceMarkdown>{content}</ResourceMarkdown>
              ) : (
                <p className="text-xs text-text-faint">Nothing to preview.</p>
              )}
            </div>
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              placeholder="Markdown: [text](https://…), bare URLs link themselves"
              aria-label="Item content"
              className={`${INPUT_CLS} font-mono text-xs`}
            />
          )}
        </>
      )}
      <div className="flex gap-2">
        <Button kind="primary" size="sm" type="submit" disabled={busy || !valid}>
          {submitLabel}
        </Button>
        <Button size="sm" type="button" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * The "Move to" list, edit and delete for one node. Shown on hover or focus,
 * like the row actions on Quotes.
 */
function NodeControls({ node, parentId, onEdit }) {
  const { tree, busy, reorder, askDelete } = useContext(EditorContext);
  const label = nodeLabel(node);

  // Every group this node may move into, except where it already is.
  const targets = flattenGroups(tree).filter(
    ({ node: g }) =>
      g.system_id !== parentId && canDropInto(tree, node.system_id, g.system_id),
  );

  return (
    <div className="flex shrink-0 items-center gap-1">
      <select
        value=""
        disabled={busy}
        onChange={(e) => {
          const value = e.target.value;
          if (!value) return;
          reorder(moveInto(tree, node.system_id, value === "__top" ? null : value));
        }}
        aria-label={`Move ${label} to`}
        title="Move into another group"
        className="h-7 max-w-[9rem] px-1 text-xs border border-border-strong bg-surface text-text-muted focus:outline-none focus:ring-2 focus:ring-brand"
      >
        <option value="">Move to…</option>
        {parentId !== null && <option value="__top">Top level</option>}
        {targets.map(({ node: g, depth }) => (
          <option key={g.system_id} value={g.system_id}>
            {`${"  ".repeat(depth)}${g.title}`}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={ICON_BTN}
        disabled={busy}
        onClick={onEdit}
        title="Edit"
        aria-label={`Edit ${label}`}
      >
        <i className="fas fa-pen text-xs" aria-hidden="true"></i>
      </button>
      <button
        type="button"
        className={ICON_BTN_DANGER}
        disabled={busy}
        onClick={() => askDelete(node)}
        title="Delete"
        aria-label={`Delete ${label}`}
      >
        <i className="fas fa-trash text-xs" aria-hidden="true"></i>
      </button>
    </div>
  );
}

/**
 * The grip a node is dragged by - the same look, label and keys as the shared
 * DragHandle in ui/Sortable.jsx. ArrowUp / ArrowDown move the node one place
 * among its siblings.
 */
function DragGrip({ node, draggable }) {
  const { tree, busy, reorder, grips } = useContext(EditorContext);
  const { attributes, listeners, setActivatorNodeRef, isDragging } = draggable;
  const id = node.system_id;

  const ref = (el) => {
    setActivatorNodeRef(el);
    if (el) grips.current.set(id, el);
    else grips.current.delete(id);
  };

  const onKeyDown = (e) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    if (busy) return;
    reorder(moveAmongSiblings(tree, id, e.key === "ArrowUp" ? -1 : 1), id);
  };

  return (
    <button
      type="button"
      ref={ref}
      {...attributes}
      {...listeners}
      onKeyDown={onKeyDown}
      disabled={busy}
      aria-label={`Reorder ${nodeLabel(node)}`}
      title="Drag to reorder (or focus and press ↑/↓)"
      className={`shrink-0 touch-none select-none px-1 text-text-faint/60 hover:text-text-faint disabled:opacity-30 ${
        isDragging ? "cursor-grabbing" : "cursor-grab"
      }`}
    >
      <i className="fas fa-grip-vertical text-[11px]" aria-hidden="true" />
    </button>
  );
}

/**
 * Drag and drop for a row - an item, or a group's header. The node is picked
 * up by `handle` (its grip), and a drop onto the row puts the dragged node in
 * this row's slot within this row's parent. `attach` is the row element's ref.
 */
function useRowDrag(node, parentId, index) {
  const ctx = useContext(EditorContext);
  const canEdit = !!ctx?.canEdit;
  const draggable = useDraggable({ id: node.system_id, disabled: !canEdit || ctx.busy });
  const droppable = useDroppable({
    id: `row:${node.system_id}`,
    disabled: !canEdit,
    data: { parentId, index },
  });
  if (!canEdit) return { attach: undefined, over: false, isDragging: false, handle: null };

  const { tree, dragging } = ctx;
  const allowed =
    dragging !== null &&
    dragging !== node.system_id &&
    canDropInto(tree, dragging, parentId);

  return {
    attach: (el) => {
      draggable.setNodeRef(el);
      droppable.setNodeRef(el);
    },
    over: droppable.isOver && allowed,
    isDragging: draggable.isDragging,
    handle: <DragGrip node={node} draggable={draggable} />,
  };
}

/**
 * The drop target of a box that appends what is dropped on it: a group's body,
 * or the top-level tail.
 */
function useAppendDrop(targetParentId) {
  const ctx = useContext(EditorContext);
  const canEdit = !!ctx?.canEdit;
  const droppable = useDroppable({
    id: `box:${targetParentId ?? "top"}`,
    disabled: !canEdit,
    data: { parentId: targetParentId },
  });
  if (!canEdit) return { attach: undefined, over: false };
  const { tree, dragging } = ctx;
  const allowed = dragging !== null && canDropInto(tree, dragging, targetParentId);
  return { attach: droppable.setNodeRef, over: droppable.isOver && allowed };
}

function ItemNode({ node, parentId, index }) {
  const ctx = useContext(EditorContext);
  const canEdit = !!ctx?.canEdit;
  const [editing, setEditing] = useState(false);
  const { attach: attachRow, ...drag } = useRowDrag(node, parentId, index);

  if (editing) {
    return (
      <NodeForm
        kind="item"
        initial={node}
        submitLabel="Save"
        busy={ctx.busy}
        onCancel={() => setEditing(false)}
        onSubmit={async (data) => {
          if (await ctx.patch(node.system_id, data)) setEditing(false);
        }}
      />
    );
  }

  return (
    <article
      ref={attachRow}
      data-testid="resource-item"
      className={`group/item border border-border bg-surface px-3 py-2.5 transition hover:border-border-strong ${
        drag.over ? DROP_ACTIVE : ""
      } ${drag.isDragging ? "opacity-40" : ""}`}
    >
      <div className="flex items-start gap-3">
        {drag.handle && <div className="mt-0.5">{drag.handle}</div>}
        <div className="min-w-0 flex-1">
          {node.title && (
            <p className="text-sm font-semibold text-text mb-1">{node.title}</p>
          )}
          <ResourceMarkdown>{node.content}</ResourceMarkdown>
        </div>
        {canEdit && (
          <div className="opacity-0 group-hover/item:opacity-100 focus-within:opacity-100 transition">
            <NodeControls
              node={node}
              parentId={parentId}
              onEdit={() => setEditing(true)}
            />
          </div>
        )}
      </div>
    </article>
  );
}

function GroupNode({ node, parentId, index, depth }) {
  const ctx = useContext(EditorContext);
  const canEdit = !!ctx?.canEdit;
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  // "item" | "group" while the add form for that kind is open.
  const [adding, setAdding] = useState(null);
  const { attach: attachRow, ...drag } = useRowDrag(node, parentId, index);
  const { attach: attachBody, ...body } = useAppendDrop(node.system_id);

  const children = node.children || [];
  const Heading = `h${Math.min(depth + 2, 6)}`;
  const topLevel = depth === 0;

  return (
    <section
      data-testid="resource-group"
      aria-label={node.title}
      className={`${
        topLevel
          ? "bg-surface border border-border"
          : "border-l-2 border-border-strong pl-3 sm:pl-4"
      } ${drag.isDragging ? "opacity-40" : ""}`}
    >
      {editing ? (
        <div className={topLevel ? "p-3" : "py-1"}>
          <NodeForm
            kind="group"
            initial={node}
            submitLabel="Save"
            busy={ctx.busy}
            onCancel={() => setEditing(false)}
            onSubmit={async (data) => {
              if (await ctx.patch(node.system_id, data)) setEditing(false);
            }}
          />
        </div>
      ) : (
        <header
          ref={attachRow}
          className={`group/head flex items-center gap-2 ${
            topLevel ? "px-4 py-3 border-b border-border" : "py-1.5"
          } ${drag.over ? DROP_ACTIVE : ""}`}
        >
          {drag.handle}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <i
              className={`fas fa-chevron-right text-[10px] text-text-faint transition-transform ${
                open ? "rotate-90" : ""
              }`}
              aria-hidden="true"
            ></i>
            <Heading
              className={`${HEADING_CLS[Math.min(depth, HEADING_CLS.length - 1)]} text-text truncate`}
            >
              {node.title}
            </Heading>
            <Eyebrow as="span" className="shrink-0">
              {children.length}
            </Eyebrow>
          </button>
          {canEdit && (
            <div className="opacity-0 group-hover/head:opacity-100 focus-within:opacity-100 transition">
              <NodeControls
                node={node}
                parentId={parentId}
                onEdit={() => setEditing(true)}
              />
            </div>
          )}
        </header>
      )}

      {open && (
        <div
          ref={attachBody}
          data-testid="resource-group-body"
          className={`space-y-3 ${topLevel ? "p-4" : "pt-1 pb-2"} ${
            body.over ? DROP_ACTIVE : ""
          }`}
        >
          {children.length === 0 && !adding && (
            <p className="text-xs text-text-faint border border-dashed border-border-strong px-3 py-3 text-center">
              {canEdit
                ? "Empty group - add an item or a subgroup, or drag one in."
                : "Nothing here yet."}
            </p>
          )}
          <NodeList nodes={children} parentId={node.system_id} depth={depth + 1} />

          {canEdit &&
            (adding ? (
              <NodeForm
                kind={adding}
                submitLabel={adding === "group" ? "Add subgroup" : "Add item"}
                busy={ctx.busy}
                onCancel={() => setAdding(null)}
                onSubmit={async (data) => {
                  const ok = await ctx.create({
                    kind: adding,
                    parent_id: node.system_id,
                    ...data,
                  });
                  if (ok) setAdding(null);
                }}
              />
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setAdding("item")}>
                  Add item
                </Button>
                <Button size="sm" onClick={() => setAdding("group")}>
                  Add subgroup
                </Button>
              </div>
            ))}
        </div>
      )}
    </section>
  );
}

function NodeList({ nodes, parentId, depth }) {
  return nodes.map((node, index) =>
    node.kind === "group" ? (
      <GroupNode
        key={node.system_id}
        node={node}
        parentId={parentId}
        index={index}
        depth={depth}
      />
    ) : (
      <ItemNode
        key={node.system_id}
        node={node}
        parentId={parentId}
        index={index}
      />
    ),
  );
}

function TopLevelDrop() {
  const ctx = useContext(EditorContext);
  const { attach: attachDrop, ...drop } = useAppendDrop(null);
  if (!ctx?.canEdit || ctx.dragging === null) return null;
  return (
    <div
      ref={attachDrop}
      className={`border border-dashed px-3 py-3 text-center font-mono text-[10px] uppercase tracking-[0.12em] ${
        drop.over ? "border-brand bg-brand-soft text-brand" : "border-border-strong text-text-faint"
      }`}
    >
      Drop here to move it to the top level
    </div>
  );
}

function deletePrompt(node) {
  if (node.kind !== "group") {
    return "This item will be deleted.";
  }
  const { group, item } = countByKind(node);
  if (group + item === 0) return "This group is empty and will be deleted.";
  const parts = [];
  if (item) parts.push(plural(item, "item"));
  if (group) parts.push(plural(group, "subgroup"));
  return `Deleting this group also deletes everything in it: ${parts.join(" and ")}.`;
}

/**
 * @param tree     The GET /api/resources payload.
 * @param canEdit  Whether to draw the editing controls (manage.catalog).
 */
export default function ResourceTree({ tree, canEdit }) {
  const { showToast } = useToast();
  const sensors = useDragSensors();
  // The system_id of the node being dragged, or null.
  const [dragging, setDragging] = useState(null);
  const grips = useRef(new Map());
  const focusAfterMove = useRef(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [addingGroup, setAddingGroup] = useState(false);

  const createMutation = useCreateResource();
  const patchMutation = usePatchResource();
  const deleteMutation = useDeleteResource();
  const reorderMutation = useReorderResources();

  const busy =
    createMutation.isPending ||
    patchMutation.isPending ||
    deleteMutation.isPending ||
    reorderMutation.isPending;

  const fail = useCallback(
    (err, fallback) => showToast("error", err?.message || fallback),
    [showToast],
  );

  // `focusId` names a grip to put focus back on once the moved node re-renders
  // somewhere else, so a held arrow key keeps moving the same node.
  const reorder = useCallback(
    (body, focusId = null) => {
      if (!body) return;
      focusAfterMove.current = focusId;
      reorderMutation.mutate(body, {
        onError: (err) => fail(err, "Move failed."),
      });
    },
    [reorderMutation, fail],
  );

  useEffect(() => {
    const id = focusAfterMove.current;
    if (id == null) return;
    const grip = grips.current.get(id);
    // The grip is disabled while the move saves; wait until it can take focus.
    if (!grip || grip.disabled) return;
    focusAfterMove.current = null;
    grip.focus();
  });

  const endDrag = () => setDragging(null);

  const onDragEnd = ({ active, over }) => {
    setDragging(null);
    if (!over || busy) return;
    const { parentId, index } = over.data.current ?? {};
    // moveInto refuses a group into its own subtree and returns null for a
    // drop that changes nothing (a node onto its own row).
    reorder(moveInto(tree, active.id, parentId ?? null, index));
  };

  const draggedNode = dragging === null ? null : findNode(tree, dragging);

  const create = async (body) => {
    try {
      await createMutation.mutateAsync(body);
      return true;
    } catch (err) {
      fail(err, "Create failed.");
      return false;
    }
  };

  const patch = async (id, data) => {
    try {
      await patchMutation.mutateAsync({ id, data });
      return true;
    } catch (err) {
      fail(err, "Update failed.");
      return false;
    }
  };

  const confirmDelete = async () => {
    try {
      await deleteMutation.mutateAsync(pendingDelete.system_id);
      showToast("success", "Deleted.");
    } catch (err) {
      fail(err, "Delete failed.");
    } finally {
      setPendingDelete(null);
    }
  };

  const cancelDelete = useCallback(() => setPendingDelete(null), []);

  const ctx = {
    tree,
    canEdit,
    busy,
    dragging,
    grips,
    reorder,
    create,
    patch,
    askDelete: setPendingDelete,
  };

  return (
    <EditorContext.Provider value={ctx}>
      <DndContext
        sensors={sensors}
        collisionDetection={innermostUnderPointer}
        measuring={MEASURING}
        onDragStart={({ active }) => setDragging(active.id)}
        onDragEnd={onDragEnd}
        onDragCancel={endDrag}
      >
        <div className="space-y-4">
          {canEdit &&
            (addingGroup ? (
              <NodeForm
                kind="group"
                submitLabel="Add group"
                busy={busy}
                onCancel={() => setAddingGroup(false)}
                onSubmit={async (data) => {
                  if (await create({ kind: "group", ...data })) setAddingGroup(false);
                }}
              />
            ) : (
              <Button kind="primary" size="sm" onClick={() => setAddingGroup(true)}>
                Add group
              </Button>
            ))}

          {tree.length === 0 ? (
            <div className="border border-dashed border-border-strong px-4 py-8 text-center">
              <p className="text-sm text-text-faint">
                {canEdit
                  ? "No resources yet. Add a group to start."
                  : "No resources yet."}
              </p>
            </div>
          ) : (
            <NodeList nodes={tree} parentId={null} depth={0} />
          )}

          <TopLevelDrop />
        </div>
        <DragOverlay dropAnimation={null}>
          {draggedNode && (
            <div className="flex items-center gap-2 border border-brand bg-surface px-3 py-2 text-sm font-semibold text-text shadow-lg cursor-grabbing">
              <i
                className={`fas ${draggedNode.kind === "group" ? "fa-folder" : "fa-grip-vertical"} text-[11px] text-text-faint`}
                aria-hidden="true"
              />
              <span className="truncate">{nodeLabel(draggedNode)}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {pendingDelete && (
        <ConfirmModal
          title={pendingDelete.kind === "group" ? "Delete group" : "Delete item"}
          confirmLabel="Delete"
          danger
          busy={deleteMutation.isPending}
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        >
          {pendingDelete.title && (
            <p className="font-semibold text-text mb-2">{pendingDelete.title}</p>
          )}
          <p>{deletePrompt(pendingDelete)}</p>
        </ConfirmModal>
      )}
    </EditorContext.Provider>
  );
}
