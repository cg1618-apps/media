// Frontend: what the choice graph reads off its rows, kept pure so the
// components stay drawing code.

// The four kinds of point, in the order a select offers them and a legend
// reads them. Mirrors the CHECK on game_choice_node.kind.
export const CHOICE_KINDS = [
  { key: "start", label: "Start" },
  { key: "choice", label: "Choice" },
  { key: "scene", label: "Scene" },
  { key: "ending", label: "Ending" },
];

export const kindLabel = (kind) =>
  CHOICE_KINDS.find((k) => k.key === kind)?.label || kind;

// The `saves` note section's link field, stored in `note.fields`.
export const SAVES_SECTION = "saves";
export const CHOICE_NODE_FIELD = "choice_node";

/** node id → the viewer's saves linked to it, in the notes' own order. */
export function savesByNode(notes = []) {
  const map = new Map();
  for (const note of notes) {
    if (note.section !== SAVES_SECTION) continue;
    const nodeId = note.fields?.[CHOICE_NODE_FIELD];
    if (!nodeId) continue;
    if (!map.has(nodeId)) map.set(nodeId, []);
    map.get(nodeId).push(note);
  }
  return map;
}

/** How one save reads in a tooltip or a list: "3 · Before the bridge". */
export const saveLabel = (save) =>
  [save.locator, save.title].filter(Boolean).join(" · ") || "Unnamed save";

/** The viewer's marks, split by what they mark: `{ nodes, edges }`, id → mark. */
export function marksByTarget(marks = []) {
  const nodes = new Map();
  const edges = new Map();
  for (const mark of marks) {
    if (mark.node_id) nodes.set(mark.node_id, mark);
    else if (mark.edge_id) edges.set(mark.edge_id, mark);
  }
  return { nodes, edges };
}

/** `{ points, endings, endingsDone }` - the card's summary line. */
export function graphCounts(graph, marks) {
  const nodes = graph?.nodes || [];
  const endings = nodes.filter((n) => n.kind === "ending");
  return {
    points: nodes.length,
    endings: endings.length,
    endingsDone: endings.filter((n) => marks.nodes.get(n.id)?.done).length,
  };
}

/** A node list grouped by kind, in CHOICE_KINDS order, empty kinds dropped. */
export function nodesByKind(nodes = []) {
  return CHOICE_KINDS.map((k) => ({
    ...k,
    nodes: nodes
      .filter((n) => n.kind === k.key)
      .sort((a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0)),
  })).filter((group) => group.nodes.length);
}
