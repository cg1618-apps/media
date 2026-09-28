// Frontend: the Resources tree - groups nesting to any depth, Markdown items
// inside them, and (for a manage.catalog holder) every control that edits it.
//
// Reading and editing are one component because they draw the same thing: an
// editor sees the reader's page with controls added, not a second layout. The
// move gestures follow WatchOrderEditor's: native HTML5 drag, chevron arrows
// for a one-place move, and a drop onto a row taking that row's slot while a
// drop onto a box's body appends to it. A "Move to" list does the same job as
// dragging into another group for anyone not using a mouse.
//
// Every move becomes one PATCH /api/resources/reorder carrying the complete new
// child list of the parent the node lands in (lib/resourceTree.js builds it).
import { createContext, useCallback, useContext, useState } from "react";

import ConfirmModal from "../modals/ConfirmModal";
import { Button, Eyebrow } from "../ui/primitives";
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
 * The arrows, "Move to" list, edit and delete for one node. Shown on hover or
 * focus, like the row actions on Quotes.
 */
function NodeControls({ node, parentId, index, siblingCount, onEdit }) {
  const { tree, busy, reorder, askDelete } = useContext(EditorContext);
  // An item's title is optional; its opening words name it instead.
  const label = node.title || (node.content || "").slice(0, 40) || "item";

  // Every group this node may move into, except where it already is.
  const targets = flattenGroups(tree).filter(
    ({ node: g }) =>
      g.system_id !== parentId && canDropInto(tree, node.system_id, g.system_id),
  );

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        className={ICON_BTN}
        disabled={busy || index === 0}
        onClick={() => reorder(moveAmongSiblings(tree, node.system_id, -1))}
        title="Move up"
        aria-label={`Move ${label} up`}
      >
        <i className="fas fa-chevron-up text-xs" aria-hidden="true"></i>
      </button>
      <button
        type="button"
        className={ICON_BTN}
        disabled={busy || index === siblingCount - 1}
        onClick={() => reorder(moveAmongSiblings(tree, node.system_id, 1))}
        title="Move down"
        aria-label={`Move ${label} down`}
      >
        <i className="fas fa-chevron-down text-xs" aria-hidden="true"></i>
      </button>
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
 * Drag handlers for a row - an item, or a group's header. Dropping here puts
 * the dragged node in this row's slot within this row's parent.
 */
function useRowDrag(node, parentId, index) {
  const ctx = useContext(EditorContext);
  if (!ctx?.canEdit) return { props: {}, over: false };
  const { tree, dragging, setDragging, overKey, setOverKey, reorder } = ctx;
  const key = `row:${node.system_id}`;
  const allowed =
    dragging !== null &&
    dragging !== node.system_id &&
    canDropInto(tree, dragging, parentId);

  return {
    over: overKey === key && allowed,
    props: {
      draggable: true,
      onDragStart: (e) => {
        // Rows nest inside groups that are rows themselves; only the
        // innermost one is being picked up.
        e.stopPropagation();
        e.dataTransfer?.setData("text/plain", node.system_id);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
        setDragging(node.system_id);
      },
      onDragEnd: () => {
        setDragging(null);
        setOverKey(null);
      },
      onDragOver: (e) => {
        e.stopPropagation();
        // Not calling preventDefault is what refuses the drop - the browser
        // shows the no-drop cursor over a group's own descendants.
        if (!allowed) return;
        e.preventDefault();
        if (overKey !== key) setOverKey(key);
      },
      onDrop: (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (allowed) reorder(moveInto(tree, dragging, parentId, index));
        setDragging(null);
        setOverKey(null);
      },
    },
  };
}

/**
 * Drag handlers for a box that appends what is dropped on it: a group's body,
 * or the top-level tail.
 */
function useAppendDrop(targetParentId) {
  const ctx = useContext(EditorContext);
  if (!ctx?.canEdit) return { props: {}, over: false };
  const { tree, dragging, setDragging, overKey, setOverKey, reorder } = ctx;
  const key = `box:${targetParentId ?? "top"}`;
  const allowed = dragging !== null && canDropInto(tree, dragging, targetParentId);

  return {
    over: overKey === key && allowed,
    props: {
      onDragOver: (e) => {
        e.stopPropagation();
        if (!allowed) return;
        e.preventDefault();
        if (overKey !== key) setOverKey(key);
      },
      onDrop: (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (allowed) reorder(moveInto(tree, dragging, targetParentId));
        setDragging(null);
        setOverKey(null);
      },
    },
  };
}

function ItemNode({ node, parentId, index, siblingCount }) {
  const ctx = useContext(EditorContext);
  const canEdit = !!ctx?.canEdit;
  const [editing, setEditing] = useState(false);
  const drag = useRowDrag(node, parentId, index);

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
      {...drag.props}
      data-testid="resource-item"
      className={`group/item border border-border bg-surface px-3 py-2.5 transition hover:border-border-strong ${
        drag.over ? DROP_ACTIVE : ""
      }`}
    >
      <div className="flex items-start gap-3">
        {canEdit && (
          <i
            className="fas fa-grip-vertical text-text-faint cursor-grab mt-1"
            aria-hidden="true"
          ></i>
        )}
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
              index={index}
              siblingCount={siblingCount}
              onEdit={() => setEditing(true)}
            />
          </div>
        )}
      </div>
    </article>
  );
}

function GroupNode({ node, parentId, index, siblingCount, depth }) {
  const ctx = useContext(EditorContext);
  const canEdit = !!ctx?.canEdit;
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  // "item" | "group" while the add form for that kind is open.
  const [adding, setAdding] = useState(null);
  const drag = useRowDrag(node, parentId, index);
  const body = useAppendDrop(node.system_id);

  const children = node.children || [];
  const Heading = `h${Math.min(depth + 2, 6)}`;
  const topLevel = depth === 0;

  return (
    <section
      data-testid="resource-group"
      aria-label={node.title}
      className={
        topLevel
          ? "bg-surface border border-border"
          : "border-l-2 border-border-strong pl-3 sm:pl-4"
      }
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
          {...drag.props}
          className={`group/head flex items-center gap-2 ${
            topLevel ? "px-4 py-3 border-b border-border" : "py-1.5"
          } ${drag.over ? DROP_ACTIVE : ""}`}
        >
          {canEdit && (
            <i className="fas fa-grip-vertical text-text-faint cursor-grab" aria-hidden="true"></i>
          )}
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
                index={index}
                siblingCount={siblingCount}
                onEdit={() => setEditing(true)}
              />
            </div>
          )}
        </header>
      )}

      {open && (
        <div
          {...body.props}
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
        siblingCount={nodes.length}
        depth={depth}
      />
    ) : (
      <ItemNode
        key={node.system_id}
        node={node}
        parentId={parentId}
        index={index}
        siblingCount={nodes.length}
      />
    ),
  );
}

function TopLevelDrop() {
  const ctx = useContext(EditorContext);
  const drop = useAppendDrop(null);
  if (!ctx?.canEdit || ctx.dragging === null) return null;
  return (
    <div
      {...drop.props}
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
  const [dragging, setDragging] = useState(null);
  const [overKey, setOverKey] = useState(null);
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

  const reorder = useCallback(
    (body) => {
      if (!body) return;
      reorderMutation.mutate(body, {
        onError: (err) => fail(err, "Move failed."),
      });
    },
    [reorderMutation, fail],
  );

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
    setDragging,
    overKey,
    setOverKey,
    reorder,
    create,
    patch,
    askDelete: setPendingDelete,
  };

  return (
    <EditorContext.Provider value={ctx}>
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
