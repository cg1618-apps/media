// Frontend: the whole choice graph, in a popup.
//
// The card on the game page is a still preview; a story with forty points
// does not read at that size, so "View all" opens this - the AnnouncementModal
// pattern, wider. Pan, zoom and a minimap; Escape closes; the page behind does
// not scroll while it is open.
//
// What a click does depends on who is looking, and the two gates are
// different permissions:
//   - everyone can open a point or an option in the side panel and read it,
//     with the viewer's own saves on a point;
//   - a viewer holding self.personal_notes (`canMark`) can mark either done
//     and keep a personal note on it - their own, beside the shared
//     description;
//   - a catalogue admin (`isAdmin`, i.e. manage.catalog) edits the graph:
//     adds a point, drags from a point's bottom handle to another to add an
//     option, and edits or deletes either from the panel.
import { useEffect, useState } from "react";

import {
  useCreateChoiceEdge,
  useCreateChoiceNode,
  useDeleteChoiceEdge,
  useDeleteChoiceNode,
  usePatchChoiceEdge,
  usePatchChoiceNode,
  useSetChoiceMark,
} from "../../api/mutations/useGameChoiceMutations";
import { Button, Eyebrow } from "../ui/primitives";
import ChoiceGraph from "./ChoiceGraph";
import { CHOICE_KINDS, kindLabel, saveLabel } from "./choiceGraphData";
import { useChoiceGraphView } from "./useChoiceGraphView";

const inputCls =
  "w-full border border-border-strong bg-surface text-text px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand";
const labelCls = "font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint";

const errorText = (e) => e?.message || "Could not reach the server.";

// --- Forms ------------------------------------------------------------------

function NodeForm({ initial, busy, error, submitLabel, onSubmit, onCancel }) {
  const [kind, setKind] = useState(initial?.kind || "scene");
  const [title, setTitle] = useState(initial?.title || "");
  const [content, setContent] = useState(initial?.content || "");
  const submit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({ kind, title: title.trim(), content: content.trim() || null });
  };
  return (
    <form onSubmit={submit} className="space-y-2">
      <label className="block space-y-1">
        <span className={labelCls}>Kind</span>
        <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls}>
          {CHOICE_KINDS.map((k) => (
            <option key={k.key} value={k.key}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className={labelCls}>Title</span>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputCls}
        />
      </label>
      <label className="block space-y-1">
        <span className={labelCls}>Description</span>
        <textarea
          rows={4}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="What happens at this point"
          className={inputCls}
        />
      </label>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" kind="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" kind="primary" disabled={busy || !title.trim()}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

// After ConnectPopup: nothing is written until the option is confirmed, and
// the sentence names both ends so the direction is never in doubt. Blank text
// stores a plain "continues to".
function OptionForm({ from, to, busy, error, onConfirm, onCancel }) {
  const [option, setOption] = useState("");
  const submit = (e) => {
    e.preventDefault();
    onConfirm(option.trim() || null);
  };
  return (
    <form onSubmit={submit} className="space-y-2">
      <Eyebrow>New option</Eyebrow>
      <p data-testid="option-sentence" className="text-sm text-text-muted">
        From <span className="text-text">{from?.title}</span> to{" "}
        <span className="text-text">{to?.title}</span>
      </p>
      <input
        autoFocus
        aria-label="Option text"
        value={option}
        onChange={(e) => setOption(e.target.value)}
        placeholder="Option text (blank: continues to)"
        className={inputCls}
      />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" kind="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" kind="primary" disabled={busy}>
          Add option
        </Button>
      </div>
    </form>
  );
}

// The viewer's own done box and note on one point or option. The box saves
// as it is ticked; the note saves on blur, like the remark box on the detail
// pages. Keyed by the caller on the saved mark, so a refetch re-seeds it.
function MarkEditor({ target, id, mark, gameId }) {
  const setMark = useSetChoiceMark(gameId);
  const [error, setError] = useState(null);
  const done = Boolean(mark?.done);
  const note = mark?.note || "";
  // The note as typed. Both saves send it, so ticking the box straight after
  // typing (which blurs the note first) cannot write the old note back.
  const [draft, setDraft] = useState(note);
  const save = async (next) => {
    setError(null);
    try {
      await setMark.mutateAsync({ target, id, done, note: draft.trim() || null, ...next });
    } catch (e) {
      setError(errorText(e));
    }
  };
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

// --- Panels -----------------------------------------------------------------

function NodePanel({ gameId, node, graph, saves, mark, isAdmin, canMark, onSelectEdge, onDeleted }) {
  const patch = usePatchChoiceNode(gameId);
  const remove = useDeleteChoiceNode(gameId);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(null);
  const title = (id) => graph.nodes.find((n) => n.id === id)?.title || "a missing point";
  const options = graph.edges
    .filter((e) => e.from_node_id === node.id)
    .sort((a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0));

  if (editing) {
    return (
      <NodeForm
        initial={node}
        busy={patch.isPending}
        error={error}
        submitLabel="Save"
        onCancel={() => setEditing(false)}
        onSubmit={async (data) => {
          setError(null);
          try {
            await patch.mutateAsync({ id: node.id, data });
            setEditing(false);
          } catch (e) {
            setError(errorText(e));
          }
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <Eyebrow>{kindLabel(node.kind)}</Eyebrow>
        <h4 className="font-display text-lg font-semibold text-text">{node.title}</h4>
      </div>
      {node.content ? (
        <p className="whitespace-pre-wrap text-sm text-text">{node.content}</p>
      ) : (
        <p className="text-xs text-text-faint">No description.</p>
      )}

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
          <p className="text-xs text-text-faint">None of your saves is at this point.</p>
        )}
      </div>

      {options.length ? (
        <div className="space-y-1">
          <Eyebrow>Options</Eyebrow>
          <ul className="space-y-0.5">
            {options.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onSelectEdge(e.id)}
                  className="text-left text-sm text-text-muted hover:text-brand"
                >
                  {e.option || "Continues"} → {title(e.to_node_id)}
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
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Button type="button" size="sm" onClick={() => setEditing(true)}>
            Edit point
          </Button>
          <DeleteButton
            label="Delete point"
            busy={remove.isPending}
            onConfirm={async () => {
              setError(null);
              try {
                await remove.mutateAsync(node.id);
                onDeleted();
              } catch (e) {
                setError(errorText(e));
              }
            }}
          />
          {error ? <p className="w-full text-xs text-danger">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function EdgePanel({ gameId, edge, graph, mark, isAdmin, canMark, onDeleted }) {
  const patch = usePatchChoiceEdge(gameId);
  const remove = useDeleteChoiceEdge(gameId);
  const [option, setOption] = useState(edge.option || "");
  const [error, setError] = useState(null);
  const title = (id) => graph.nodes.find((n) => n.id === id)?.title || "a missing point";
  const changed = (option.trim() || null) !== (edge.option || null);

  return (
    <div className="space-y-3">
      <div>
        <Eyebrow>Option</Eyebrow>
        <h4 className="font-display text-lg font-semibold text-text">
          {edge.option || "Continues"}
        </h4>
        <p className="text-sm text-text-muted">
          From <span className="text-text">{title(edge.from_node_id)}</span> to{" "}
          <span className="text-text">{title(edge.to_node_id)}</span>
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
        <div className="space-y-2 border-t border-border pt-3">
          <label className="block space-y-1">
            <span className={labelCls}>Option text</span>
            <input
              value={option}
              onChange={(e) => setOption(e.target.value)}
              placeholder="Blank: continues to"
              className={inputCls}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              kind="primary"
              disabled={!changed || patch.isPending}
              onClick={async () => {
                setError(null);
                try {
                  await patch.mutateAsync({ id: edge.id, data: { option: option.trim() || null } });
                } catch (e) {
                  setError(errorText(e));
                }
              }}
            >
              Save option
            </Button>
            <DeleteButton
              label="Delete option"
              busy={remove.isPending}
              onConfirm={async () => {
                setError(null);
                try {
                  await remove.mutateAsync(edge.id);
                  onDeleted();
                } catch (e) {
                  setError(errorText(e));
                }
              }}
            />
          </div>
          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </div>
      ) : null}
    </div>
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
  // What the side panel shows: null, {type: "add"}, {type: "node", id},
  // {type: "edge", id} or {type: "connect", from, to}.
  const [panel, setPanel] = useState(startAdding && isAdmin ? { type: "add" } : null);
  const [error, setError] = useState(null);

  const open = (next) => {
    setError(null);
    setPanel(next);
  };

  // Escape closes - unless an option is waiting to be confirmed, when it
  // cancels that, as ConnectPopup's Escape does. The page under the popup
  // stops scrolling, and the cleanup gives the scroll back however the modal
  // goes away, a route change included.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      if (panel?.type === "connect") setPanel(null);
      else onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [panel, onClose]);
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
  const nodeById = (id) => nodes.find((n) => n.id === id);

  let panelBody = null;
  if (panel?.type === "add") {
    panelBody = (
      <div className="space-y-2">
        <Eyebrow>New point</Eyebrow>
        <NodeForm
          busy={createNode.isPending}
          error={error}
          submitLabel="Add point"
          onCancel={() => open(null)}
          onSubmit={async (data) => {
            setError(null);
            try {
              const created = await createNode.mutateAsync({ ...data, sort_index: nodes.length });
              open(created?.id ? { type: "node", id: created.id } : null);
            } catch (e) {
              setError(errorText(e));
            }
          }}
        />
      </div>
    );
  } else if (panel?.type === "connect") {
    panelBody = (
      <OptionForm
        from={nodeById(panel.from)}
        to={nodeById(panel.to)}
        busy={createEdge.isPending}
        error={error}
        onCancel={() => open(null)}
        onConfirm={async (option) => {
          setError(null);
          try {
            const sortIndex = edges.filter((e) => e.from_node_id === panel.from).length;
            const created = await createEdge.mutateAsync({
              from_node_id: panel.from,
              to_node_id: panel.to,
              option,
              sort_index: sortIndex,
            });
            open(created?.id ? { type: "edge", id: created.id } : null);
          } catch (e) {
            setError(errorText(e));
          }
        }}
      />
    );
  } else if (panelNode) {
    panelBody = (
      <NodePanel
        key={panelNode.id}
        gameId={gameId}
        node={panelNode}
        graph={graph}
        saves={saves.get(panelNode.id) || []}
        mark={marks.nodes.get(panelNode.id)}
        isAdmin={isAdmin}
        canMark={canMark}
        onSelectEdge={(id) => open({ type: "edge", id })}
        onDeleted={() => {
          open(null);
          // Deleting a point clears every save's link to it server-side.
          reloadNotes?.();
        }}
      />
    );
  } else if (panelEdge) {
    panelBody = (
      <EdgePanel
        key={panelEdge.id}
        gameId={gameId}
        edge={panelEdge}
        graph={graph}
        mark={marks.edges.get(panelEdge.id)}
        isAdmin={isAdmin}
        canMark={canMark}
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
                Add point
              </Button>
            ) : null}
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
          <div className="relative flex-1 min-w-0 bg-surface-2">
            {query.isLoading ? (
              <p className="p-6 text-sm text-text-faint">Loading…</p>
            ) : query.isError ? (
              <p className="p-6 text-sm text-danger">
                Could not load the choices: {errorText(query.error)}
              </p>
            ) : nodes.length === 0 ? (
              <p className="p-6 text-sm text-text-faint">
                No points yet.{isAdmin ? " Add the first one to start the graph." : ""}
              </p>
            ) : (
              <ChoiceGraph
                graph={graph}
                marks={marks}
                saves={saves}
                interactive
                editable={isAdmin}
                selected={selected}
                onSelectNode={(id) => open({ type: "node", id })}
                onSelectEdge={(id) => open({ type: "edge", id })}
                onConnect={({ from, to }) => open({ type: "connect", from, to })}
                onPaneClick={() => {
                  if (panel?.type === "node" || panel?.type === "edge") open(null);
                }}
              />
            )}
            {isAdmin && nodes.length > 0 ? (
              <p className="pointer-events-none absolute left-3 top-3 font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
                Drag from a point&apos;s bottom handle to another point to add an option
              </p>
            ) : null}
          </div>

          {panelBody ? (
            <aside
              aria-label="Details"
              className="w-80 shrink-0 overflow-y-auto border-l border-border bg-surface p-4"
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
        </div>
      </div>
    </div>
  );
}
