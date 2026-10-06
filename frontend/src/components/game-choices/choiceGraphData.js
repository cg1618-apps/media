// Frontend: what the choice graph reads off its rows, kept pure so the
// components stay drawing code.
//
// The vocabulary: a BLOCK is a story part (a node: start, part or ending). Out
// of a block hang BRANCHES (edges of kind choice - the player picks - or
// condition - the game decides), each leading to at most one next block. A
// block may also LINK straight to another block (an edge of kind link).

// The three kinds of block, in the order a select offers them and a list
// groups them. Mirrors the CHECK on game_choice_node.kind.
export const BLOCK_KINDS = [
  { key: "start", label: "Start" },
  { key: "part", label: "Part" },
  { key: "ending", label: "Ending" },
];

// The two kinds of branch, and the icon each is drawn with.
export const BRANCH_KINDS = [
  { key: "choice", label: "Choice", icon: "fa-code-branch" },
  { key: "condition", label: "Condition", icon: "fa-circle-question" },
];

export const blockKindLabel = (kind) => BLOCK_KINDS.find((k) => k.key === kind)?.label || kind;
export const branchKind = (kind) => BRANCH_KINDS.find((k) => k.key === kind) || BRANCH_KINDS[0];

export const isBranchEdge = (edge) => edge?.kind === "choice" || edge?.kind === "condition";
export const isLinkEdge = (edge) => edge?.kind === "link";

const bySortIndex = (a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0);

/** The branches out of one block, in their own order. */
export const branchesFrom = (edges = [], nodeId) =>
  edges.filter((e) => isBranchEdge(e) && e.from_node_id === nodeId).sort(bySortIndex);

/** The plain links out of one block, in their own order. */
export const linksFrom = (edges = [], nodeId) =>
  edges.filter((e) => isLinkEdge(e) && e.from_node_id === nodeId).sort(bySortIndex);

/** The next free sort_index among the edges out of one block. */
export const nextEdgeSortIndex = (edges = [], nodeId) =>
  edges
    .filter((e) => e.from_node_id === nodeId)
    .reduce((max, e) => Math.max(max, (e.sort_index ?? 0) + 1), 0);

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

/**
 * `{ parts, choices, endings, endingsDone }` - the card's summary line. Every
 * block is a part; choices counts both kinds of branch.
 */
export function graphCounts(graph, marks) {
  const nodes = graph?.nodes || [];
  const edges = graph?.edges || [];
  const endings = nodes.filter((n) => n.kind === "ending");
  return {
    parts: nodes.length,
    choices: edges.filter(isBranchEdge).length,
    endings: endings.length,
    endingsDone: endings.filter((n) => marks.nodes.get(n.id)?.done).length,
  };
}

/** The blocks of one kind, in sort_index order. */
export const blocksOfKind = (nodes = [], kind) =>
  nodes.filter((n) => n.kind === kind).sort(bySortIndex);

/** A block list grouped by kind, in BLOCK_KINDS order, empty kinds dropped. */
export function nodesByKind(nodes = []) {
  return BLOCK_KINDS.map((k) => ({ ...k, nodes: blocksOfKind(nodes, k.key) })).filter(
    (group) => group.nodes.length,
  );
}
