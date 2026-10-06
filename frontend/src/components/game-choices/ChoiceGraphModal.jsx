// Frontend: the whole choice graph, in a popup.
//
// The card on the game page is a still preview; a story with forty blocks
// does not read at that size, so "View all" opens this - the AnnouncementModal
// pattern, wider. Pan, zoom and a minimap; Escape closes; the page behind does
// not scroll while it is open.
//
// Three columns. The canvas in the middle. A RIGHT RAIL, always there (and
// hidden from the header when the canvas wants the room), listing the
// story's starts and endings: each expands in place, and "Show in graph"
// centres the canvas on it and selects it. And on the LEFT, a drawer that
// opens with whatever is selected or being written, and closes with its own
// button or a click on the empty canvas. The drawer is on the other side from
// the rail so opening it never moves the lists the viewer is reading.
//
// What a click does depends on who is looking, and the two gates are
// different permissions:
//   - everyone can open a block or a branch in the drawer and read it, with
//     the viewer's own saves on a block;
//   - a viewer holding self.personal_notes (`canMark`) can mark either done
//     and keep a personal note on it - their own, beside the shared
//     description;
//   - a catalogue admin (`isAdmin`, i.e. manage.catalog) edits the graph: adds
//     blocks, adds choices and conditions out of a block, gives a branch its
//     next part (a new block, or an existing one), links blocks, and edits or
//     deletes any of it. Dragging works too: from a block's bottom handle to
//     another block links them; from a branch's to a block sets its next part.
import { useEffect, useRef, useState } from "react";

import {
  useCreateChoiceEdge,
  useCreateChoiceNode,
  useCreateNextPart,
  useDeleteChoiceEdge,
  useDeleteChoiceNode,
  usePatchChoiceEdge,
  usePatchChoiceNode,
  useSetChoiceMark,
} from "../../api/mutations/useGameChoiceMutations";
import { Button, Eyebrow } from "../ui/primitives";
import ChoiceGraph from "./ChoiceGraph";
import {
  BLOCK_KINDS,
  BRANCH_KINDS,
  blockKindLabel,
  blocksOfKind,
  branchKind,
  branchesFrom,
  isBranchEdge,
  isLinkEdge,
  linksFrom,
  nextEdgeSortIndex,
  nodesByKind,
  saveLabel,
} from "./choiceGraphData";
import { useChoiceGraphView } from "./useChoiceGraphView";

const inputCls =
  "w-full border border-border-strong bg-surface text-text px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand";
const labelCls = "font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint";

const errorText = (e) => e?.message || "Could not reach the server.";

/** Runs one write, keeping its error for the form that asked for it. */
function useAction() {
  const [error, setError] = useState(null);
  const run = async (fn) => {
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    }
  };
  return { error, setError, run };
}

// --- Forms ------------------------------------------------------------------

function FormButtons({ busy, disabled, submitLabel, onCancel }) {
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" size="sm" kind="ghost" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" size="sm" kind="primary" disabled={busy || disabled}>
        {submitLabel}
      </Button>
    </div>
  );
}

/** Title and description, and a kind select when `kinds` is given. */
function ItemForm({ heading, kinds, initial, busy, error, submitLabel, placeholder, onSubmit, onCancel }) {
  const [kind, setKind] = useState(initial?.kind || kinds?.[0]?.key);
  const [title, setTitle] = useState(initial?.title || "");
  const [content, setContent] = useState(initial?.content || "");
  const submit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({
      ...(kinds ? { kind } : {}),
      title: title.trim(),
      content: content.trim() || null,
    });
  };
  return (
    <form onSubmit={submit} className="space-y-2">
      {heading ? <Eyebrow>{heading}</Eyebrow> : null}
      {kinds ? (
        <label className="block space-y-1">
          <span className={labelCls}>Kind</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls}>
            {kinds.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="block space-y-1">
        <span className={labelCls}>Title</span>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
      </label>
      <label className="block space-y-1">
        <span className={labelCls}>Description</span>
        <textarea
          rows={3}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={placeholder}
          className={inputCls}
        />
      </label>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <FormButtons busy={busy} disabled={!title.trim()} submitLabel={submitLabel} onCancel={onCancel} />
    </form>
  );
}

/** A select of the game's blocks, grouped by kind. */
function BlockSelect({ label, nodes, value, onChange, exclude }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={inputCls}
    >
      <option value="">Pick a block</option>
      {nodesByKind(nodes.filter((n) => n.id !== exclude)).map((group) => (
        <optgroup key={group.key} label={group.label}>
          {group.nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.title}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** Pick an existing block and confirm. */
function PickBlockForm({ label, submitLabel, nodes, exclude, busy, error, onSubmit, onCancel }) {
  const [target, setTarget] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (target) onSubmit(target);
      }}
      className="space-y-2"
    >
      <Eyebrow>{label}</Eyebrow>
      <BlockSelect label={label} nodes={nodes} value={target} onChange={setTarget} exclude={exclude} />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <FormButtons busy={busy} disabled={!target} submitLabel={submitLabel} onCancel={onCancel} />
    </form>
  );
}

// The viewer's own done box and note on one block or branch. The box saves as
// it is ticked; the note saves on blur, like the remark box on the detail
// pages. Keyed by the caller on the saved mark, so a refetch re-seeds it.
function MarkEditor({ target, id, mark, gameId }) {
  const setMark = useSetChoiceMark(gameId);
  const { error, run } = useAction();
  const done = Boolean(mark?.done);
  const note = mark?.note || "";
  // The note as typed. Both saves send it, so ticking the box straight after
  // typing (which blurs the note first) cannot write the old note back.
  const [draft, setDraft] = useState(note);
  const save = (next) =>
    run(() => setMark.mutateAsync({ target, id, done, note: draft.trim() || null, ...next }));
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <Eyebrow>Mine</Eyebrow>
      <label className="flex items-center gap-2 text-sm text-text">
        <input
          type="checkbox"
          checked={done}
          disabled={setMark.isPending}
          onChange={(e) => save({ done: e.target.checked })}
          className="accent-brand"
        />
        Done
      </label>
      <label className="block space-y-1">
        <span className={labelCls}>My note</span>
        <textarea
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft.trim() !== note) save({});
          }}
          placeholder="Only you see this"
          className={inputCls}
        />
      </label>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

// A destructive button that asks once more in place. Not ConfirmModal: its
// own Escape listener would close this popup along with itself.
function DeleteButton({ label, busy, onConfirm }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button type="button" size="sm" kind="ghost" onClick={() => setAsking(true)}>
        {label}
      </Button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Button type="button" size="sm" kind="danger" disabled={busy} onClick={onConfirm}>
        Confirm delete
      </Button>
      <Button type="button" size="sm" kind="ghost" onClick={() => setAsking(false)}>
        Keep
      </Button>
    </span>
  );
}

function Description({ content }) {
  return content ? (
    <p className="whitespace-pre-wrap text-sm text-text">{content}</p>
  ) : (
    <p className="text-xs text-text-faint">No description.</p>
  );
}

const linkCls = "text-left text-sm text-text-muted hover:text-brand";

// --- Panels -----------------------------------------------------------------

function BlockPanel({ gameId, node, graph, saves, mark, isAdmin, canMark, onOpen, onDeleted }) {
  const patch = usePatchChoiceNode(gameId);
  const remove = useDeleteChoiceNode(gameId);
  const createEdge = useCreateChoiceEdge(gameId);
  const { error, setError, run } = useAction();
  // null, "edit", "choice", "condition" or "link".
  const [mode, setMode] = useState(null);
  const switchMode = (next) => {
    setError(null);
    setMode(next);
  };
  const titleOf = (id) => graph.nodes.find((n) => n.id === id)?.title || "a missing block";
  const branches = branchesFrom(graph.edges, node.id);
  const links = linksFrom(graph.edges, node.id);

  if (mode === "edit") {
    return (
      <ItemForm
        heading="Edit block"
        kinds={BLOCK_KINDS}
        initial={node}
        busy={patch.isPending}
        error={error}
        submitLabel="Save"
        placeholder="What happens in this part"
        onCancel={() => switchMode(null)}
        onSubmit={async (data) => {
          if (await run(() => patch.mutateAsync({ id: node.id, data }))) setMode(null);
        }}
      />
    );
  }

  let form = null;
  if (mode === "choice" || mode === "condition") {
    const kind = branchKind(mode);
    form = (
      <ItemForm
        key={mode}
        heading={`New ${kind.label.toLowerCase()}`}
        busy={createEdge.isPending}
        error={error}
        submitLabel={`Add ${kind.label.toLowerCase()}`}
        placeholder={mode === "choice" ? "What the player picks" : "What the game checks"}
        onCancel={() => switchMode(null)}
        onSubmit={async (data) => {
          const ok = await run(() =>
            createEdge.mutateAsync({
              kind: mode,
              from_node_id: node.id,
              ...data,
              sort_index: nextEdgeSortIndex(graph.edges, node.id),
            }),
          );
          if (ok) setMode(null);
        }}
      />
    );
  } else if (mode === "link") {
    form = (
      <PickBlockForm
        label="Link to block"
        submitLabel="Add link"
        nodes={graph.nodes}
        exclude={node.id}
        busy={createEdge.isPending}
        error={error}
        onCancel={() => switchMode(null)}
        onSubmit={async (to) => {
          const ok = await run(() =>
            createEdge.mutateAsync({
              kind: "link",
              from_node_id: node.id,
              to_node_id: to,
              sort_index: nextEdgeSortIndex(graph.edges, node.id),
            }),
          );
          if (ok) setMode(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <Eyebrow>{blockKindLabel(node.kind)}</Eyebrow>
        <h4 className="font-display text-lg font-semibold text-text">{node.title}</h4>
      </div>
      <Description content={node.content} />

      <div className="space-y-1">
        <Eyebrow>My saves here</Eyebrow>
        {saves.length ? (
          <ul className="space-y-0.5">
            {saves.map((s) => (
              <li key={s.system_id} className="text-sm text-text">
                {saveLabel(s)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-text-faint">None of your saves is at this block.</p>
        )}
      </div>

      {branches.length ? (
        <div className="space-y-1">
          <Eyebrow>Branches</Eyebrow>
          <ul className="space-y-0.5">
            {branches.map((e) => (
              <li key={e.id} className="flex items-baseline gap-1.5">
                <i
                  className={`fas ${branchKind(e.kind).icon} text-[10px] text-brand`}
                  aria-hidden="true"
                ></i>
                <button type="button" onClick={() => onOpen({ type: "edge", id: e.id })} className={linkCls}>
                  {e.title} → {e.to_node_id ? titleOf(e.to_node_id) : "no next part yet"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {links.length ? (
        <div className="space-y-1">
          <Eyebrow>Links</Eyebrow>
          <ul className="space-y-0.5">
            {links.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => onOpen({ type: "edge", id: e.id })} className={linkCls}>
                  Links to {titleOf(e.to_node_id)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canMark ? (
        <MarkEditor
          key={`${node.id}:${mark?.done}:${mark?.note}`}
          target="node"
          id={node.id}
          mark={mark}
          gameId={gameId}
        />
      ) : null}

      {isAdmin ? (
        <div className="space-y-3 border-t border-border pt-3">
          {form || (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" onClick={() => switchMode("choice")}>
                + Add choice
              </Button>
              <Button type="button" size="sm" onClick={() => switchMode("condition")}>
                + Add condition
              </Button>
              <Button type="button" size="sm" onClick={() => switchMode("link")}>
                + Link to block
              </Button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={() => switchMode("edit")}>
              Edit block
            </Button>
            <DeleteButton
              label="Delete block"
              busy={remove.isPending}
              onConfirm={async () => {
                if (await run(() => remove.mutateAsync(node.id))) onDeleted();
              }}
            />
          </div>
          {error && !form ? <p className="text-xs text-danger">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function BranchPanel({ gameId, edge, graph, mark, isAdmin, canMark, startMode, onOpen, onDeleted }) {
  const patch = usePatchChoiceEdge(gameId);
  const remove = useDeleteChoiceEdge(gameId);
  const next = useCreateNextPart(gameId);
  const { error, setError, run } = useAction();
  // null, "edit", "next" (a new block) or "pick" (an existing one).
  const [mode, setMode] = useState(startMode || null);
  const switchMode = (m) => {
    setError(null);
    setMode(m);
  };
  const kind = branchKind(edge.kind);
  const from = graph.nodes.find((n) => n.id === edge.from_node_id);
  const to = edge.to_node_id ? graph.nodes.find((n) => n.id === edge.to_node_id) : null;

  if (mode === "edit") {
    return (
      <ItemForm
        heading={`Edit ${kind.label.toLowerCase()}`}
        kinds={BRANCH_KINDS}
        initial={edge}
        busy={patch.isPending}
        error={error}
        submitLabel="Save"
        placeholder={edge.kind === "choice" ? "What the player picks" : "What the game checks"}
        onCancel={() => switchMode(null)}
        onSubmit={async (data) => {
          if (await run(() => patch.mutateAsync({ id: edge.id, data }))) setMode(null);
        }}
      />
    );
  }

  let form = null;
  if (mode === "next") {
    form = (
      <ItemForm
        heading="Add next part"
        kinds={[BLOCK_KINDS[1], BLOCK_KINDS[2], BLOCK_KINDS[0]]}
        busy={next.isPending}
        error={error}
        submitLabel="Add next part"
        placeholder="What happens in this part"
        onCancel={() => switchMode(null)}
        onSubmit={async (data) => {
          let created = null;
          const ok = await run(async () => {
            created = await next.mutateAsync({ id: edge.id, ...data });
          });
          if (!ok) return;
          setMode(null);
          // Straight on to the new block, ready for its own branches.
          if (created?.node?.id) onOpen({ type: "node", id: created.node.id });
        }}
      />
    );
  } else if (mode === "pick") {
    form = (
      <PickBlockForm
        label="Link to existing block"
        submitLabel="Set next part"
        nodes={graph.nodes}
        busy={patch.isPending}
        error={error}
        onCancel={() => switchMode(null)}
        onSubmit={async (target) => {
          if (await run(() => patch.mutateAsync({ id: edge.id, data: { to_node_id: target } }))) {
            setMode(null);
          }
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <Eyebrow>
          <i className={`fas ${kind.icon} mr-1 text-brand`} aria-hidden="true"></i>
          {kind.label}
        </Eyebrow>
        <h4 className="font-display text-lg font-semibold text-text">{edge.title}</h4>
      </div>
      <Description content={edge.content} />
      <div className="space-y-1 text-sm text-text-muted">
        <p>
          From{" "}
          {from ? (
            <button type="button" onClick={() => onOpen({ type: "node", id: from.id })} className="text-text hover:text-brand">
              {from.title}
            </button>
          ) : (
            "a missing block"
          )}
        </p>
        <p data-testid="branch-next">
          {to ? (
            <>
              Leads to{" "}
              <button type="button" onClick={() => onOpen({ type: "node", id: to.id })} className="text-text hover:text-brand">
                {to.title}
              </button>
            </>
          ) : (
            "No next part yet."
          )}
        </p>
      </div>

      {canMark ? (
        <MarkEditor
          key={`${edge.id}:${mark?.done}:${mark?.note}`}
          target="edge"
          id={edge.id}
          mark={mark}
          gameId={gameId}
        />
      ) : null}

      {isAdmin ? (
        <div className="space-y-3 border-t border-border pt-3">
          {form || (
            <div className="flex flex-wrap items-center gap-2">
              {to ? null : (
                <Button type="button" size="sm" onClick={() => switchMode("next")}>
                  Add next part
                </Button>
              )}
              <Button type="button" size="sm" onClick={() => switchMode("pick")}>
                Link to existing block
              </Button>
              {to ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={patch.isPending}
                  onClick={() => run(() => patch.mutateAsync({ id: edge.id, data: { to_node_id: null } }))}
                >
                  Clear next part
                </Button>
              ) : null}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={() => switchMode("edit")}>
              Edit {kind.label.toLowerCase()}
            </Button>
            <DeleteButton
              label={`Delete ${kind.label.toLowerCase()}`}
              busy={remove.isPending}
              onConfirm={async () => {
                if (await run(() => remove.mutateAsync(edge.id))) onDeleted();
              }}
            />
          </div>
          {error && !form ? <p className="text-xs text-danger">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function LinkPanel({ gameId, edge, graph, isAdmin, onOpen, onDeleted }) {
  const remove = useDeleteChoiceEdge(gameId);
  const { error, run } = useAction();
  const block = (id) => {
    const n = graph.nodes.find((x) => x.id === id);
    return n ? (
      <button type="button" onClick={() => onOpen({ type: "node", id })} className="text-text hover:text-brand">
        {n.title}
      </button>
    ) : (
      "a missing block"
    );
  };
  return (
    <div className="space-y-3">
      <div>
        <Eyebrow>Link</Eyebrow>
        <p className="text-sm text-text-muted">
          From {block(edge.from_node_id)} straight to {block(edge.to_node_id)}
        </p>
      </div>
      {isAdmin ? (
        <div className="space-y-2 border-t border-border pt-3">
          <DeleteButton
            label="Delete link"
            busy={remove.isPending}
            onConfirm={async () => {
              if (await run(() => remove.mutateAsync(edge.id))) onDeleted();
            }}
          />
          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

// --- The right rail: starts and endings -------------------------------------

function RailItem({ node, mark, canMark, showDone, onShow }) {
  const [open, setOpen] = useState(false);
  const done = Boolean(mark?.done);
  return (
    <li data-testid={`rail-item-${node.id}`} className="border-b border-border last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 py-1.5 text-left text-sm text-text hover:text-brand"
      >
        <i className={`fas fa-chevron-${open ? "down" : "right"} w-2.5 text-[9px] text-text-faint`} aria-hidden="true"></i>
        <span className="min-w-0 flex-1 truncate">{node.title}</span>
        {showDone && done ? (
          <i className="fas fa-check text-xs text-brand" title="Done" aria-label="Done"></i>
        ) : null}
      </button>
      {open ? (
        <div className="space-y-2 pb-2 pl-4">
          <Description content={node.content} />
          {canMark ? (
            <>
              <p className="text-xs text-text-muted">{done ? "Done" : "Not done yet"}</p>
              {mark?.note ? (
                <p className="whitespace-pre-wrap text-xs text-text-muted">
                  <span className={labelCls}>My note </span>
                  {mark.note}
                </p>
              ) : null}
            </>
          ) : null}
          <Button type="button" size="sm" onClick={() => onShow(node.id)}>
            Show in graph
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function RailSection({ label, nodes, marks, canMark, showDone, onShow }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="space-y-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint hover:text-text"
      >
        <span>
          {label} ({nodes.length})
        </span>
        <i className={`fas fa-chevron-${open ? "up" : "down"}`} aria-hidden="true"></i>
      </button>
      {open ? (
        nodes.length ? (
          <ul>
            {nodes.map((n) => (
              <RailItem
                key={n.id}
                node={n}
                mark={marks.nodes.get(n.id)}
                canMark={canMark}
                showDone={showDone}
                onShow={onShow}
              />
            ))}
          </ul>
        ) : (
          <p className="text-xs text-text-faint">None yet.</p>
        )
      ) : null}
    </section>
  );
}

// --- Modal ------------------------------------------------------------------

export default function ChoiceGraphModal({
  gameId,
  title,
  isAdmin = false,
  canMark = false,
  startAdding = false,
  onClose,
}) {
  const { query, graph, marks, saves, reloadNotes } = useChoiceGraphView(gameId);
  const createNode = useCreateChoiceNode(gameId);
  const createEdge = useCreateChoiceEdge(gameId);
  const patchEdge = usePatchChoiceEdge(gameId);
  // What the drawer shows: null, {type: "add"}, {type: "node", id} or
  // {type: "edge", id, mode?} - a branch or a link.
  const [panel, setPanel] = useState(startAdding && isAdmin ? { type: "add" } : null);
  const [railOpen, setRailOpen] = useState(true);
  // "Show in graph" requests; the nonce makes a repeat request a new one.
  const [focus, setFocus] = useState(null);
  const nonce = useRef(0);
  const add = useAction();
  const drag = useAction();

  const open = (next) => {
    add.setError(null);
    drag.setError(null);
    setPanel(next);
  };

  // Escape closes. The page under the popup stops scrolling, and the cleanup
  // gives the scroll back however the modal goes away, a route change
  // included.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const nodes = graph?.nodes || [];
  const edges = graph?.edges || [];
  const selected = panel?.type === "node" || panel?.type === "edge" ? panel : null;
  const panelNode = panel?.type === "node" ? nodes.find((n) => n.id === panel.id) : null;
  const panelEdge = panel?.type === "edge" ? edges.find((e) => e.id === panel.id) : null;

  const showInGraph = (id) => {
    open({ type: "node", id });
    nonce.current += 1;
    setFocus({ type: "node", id, nonce: nonce.current });
  };

  // A drag on the canvas: a link between two blocks, or a branch's next part.
  const onConnect = (intent) =>
    drag.run(async () => {
      if (intent.type === "link") {
        await createEdge.mutateAsync({
          kind: "link",
          from_node_id: intent.from,
          to_node_id: intent.to,
          sort_index: nextEdgeSortIndex(edges, intent.from),
        });
      } else {
        await patchEdge.mutateAsync({ id: intent.edgeId, data: { to_node_id: intent.to } });
        setPanel({ type: "edge", id: intent.edgeId });
      }
    });

  let panelBody = null;
  if (panel?.type === "add") {
    panelBody = (
      <ItemForm
        heading="New block"
        kinds={nodes.length ? [BLOCK_KINDS[1], BLOCK_KINDS[2], BLOCK_KINDS[0]] : BLOCK_KINDS}
        busy={createNode.isPending}
        error={add.error}
        submitLabel="Add block"
        placeholder="What happens in this part"
        onCancel={() => open(null)}
        onSubmit={async (data) => {
          let created = null;
          const ok = await add.run(async () => {
            created = await createNode.mutateAsync({ ...data, sort_index: nodes.length });
          });
          if (ok) open(created?.id ? { type: "node", id: created.id } : null);
        }}
      />
    );
  } else if (panelNode) {
    panelBody = (
      <BlockPanel
        key={panelNode.id}
        gameId={gameId}
        node={panelNode}
        graph={graph}
        saves={saves.get(panelNode.id) || []}
        mark={marks.nodes.get(panelNode.id)}
        isAdmin={isAdmin}
        canMark={canMark}
        onOpen={open}
        onDeleted={() => {
          open(null);
          // Deleting a block clears every save's link to it server-side.
          reloadNotes?.();
        }}
      />
    );
  } else if (panelEdge && isBranchEdge(panelEdge)) {
    panelBody = (
      <BranchPanel
        key={`${panelEdge.id}:${panel.mode || ""}`}
        gameId={gameId}
        edge={panelEdge}
        graph={graph}
        mark={marks.edges.get(panelEdge.id)}
        isAdmin={isAdmin}
        canMark={canMark}
        startMode={isAdmin ? panel.mode : null}
        onOpen={open}
        onDeleted={() => open(null)}
      />
    );
  } else if (panelEdge && isLinkEdge(panelEdge)) {
    panelBody = (
      <LinkPanel
        key={panelEdge.id}
        gameId={gameId}
        edge={panelEdge}
        graph={graph}
        isAdmin={isAdmin}
        onOpen={open}
        onDeleted={() => open(null)}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 transition-opacity"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="choice-graph-modal-title"
        className="bg-surface border border-border shadow-xl w-[95vw] max-w-7xl h-[90vh] flex flex-col overflow-hidden m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-3 border-b border-border flex justify-between items-center gap-3 shrink-0">
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
              分歧 Choices
            </div>
            <h3
              id="choice-graph-modal-title"
              className="font-display text-xl font-semibold text-text truncate"
            >
              {title || "Choices"}
            </h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isAdmin ? (
              <Button type="button" size="sm" onClick={() => open({ type: "add" })}>
                Add block
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              kind="ghost"
              aria-pressed={railOpen}
              onClick={() => setRailOpen((v) => !v)}
            >
              Starts &amp; endings
            </Button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-text-faint hover:text-text transition px-1.5 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          {panelBody ? (
            <aside
              aria-label="Details"
              className="w-80 max-w-[60%] shrink-0 overflow-y-auto border-r border-border bg-surface p-4"
            >
              <div className="mb-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => open(null)}
                  aria-label="Close panel"
                  className="text-xs text-text-faint hover:text-text"
                >
                  <i className="fas fa-xmark"></i>
                </button>
              </div>
              {panelBody}
            </aside>
          ) : null}

          <div className="relative flex-1 min-w-0 bg-surface-2">
            {query.isLoading ? (
              <p className="p-6 text-sm text-text-faint">Loading…</p>
            ) : query.isError ? (
              <p className="p-6 text-sm text-danger">
                Could not load the choices: {errorText(query.error)}
              </p>
            ) : nodes.length === 0 ? (
              <p className="p-6 text-sm text-text-faint">
                No blocks yet.{isAdmin ? " Add the first one to start the graph." : ""}
              </p>
            ) : (
              <ChoiceGraph
                graph={graph}
                marks={marks}
                saves={saves}
                interactive
                editable={isAdmin}
                selected={selected}
                focus={focus}
                onSelect={open}
                onConnect={onConnect}
                onAddNext={(id) => open({ type: "edge", id, mode: "next" })}
                onPaneClick={() => {
                  if (selected) open(null);
                }}
              />
            )}
            {isAdmin && nodes.length > 0 ? (
              <p className="pointer-events-none absolute left-3 top-3 max-w-[80%] font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
                Drag from a block&apos;s bottom handle to another block to link them, or from a
                branch&apos;s to set its next part
              </p>
            ) : null}
            {drag.error ? (
              <p role="alert" className="absolute bottom-3 left-3 border border-danger bg-surface px-2 py-1 text-xs text-danger">
                {drag.error}
              </p>
            ) : null}
          </div>

          {railOpen ? (
            <aside
              aria-label="Starts and endings"
              className="w-64 max-w-[40%] shrink-0 space-y-4 overflow-y-auto border-l border-border bg-surface p-4"
            >
              <RailSection
                label="Starts"
                nodes={blocksOfKind(nodes, "start")}
                marks={marks}
                canMark={canMark}
                showDone={false}
                onShow={showInGraph}
              />
              <RailSection
                label="Endings"
                nodes={blocksOfKind(nodes, "ending")}
                marks={marks}
                canMark={canMark}
                showDone
                onShow={showInGraph}
              />
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}
