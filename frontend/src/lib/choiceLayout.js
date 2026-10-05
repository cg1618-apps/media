// Frontend: positions and sizes for a game's choice graph.
//
// Pure, no DOM, and no stored positions: the layout is a function of the rows,
// so the same graph always draws the same way and the function is tested on
// its own. Layered top to bottom - a start at the top, the endings below the
// parts that lead to them.
//
// Two kinds of item are laid out. A BLOCK is a story part (a node). A BRANCH
// is a choice or a condition hanging out of a block (an edge of kind `choice`
// or `condition`); it is drawn as its own pill under its block, so it takes a
// place in the layout like a block does. Three kinds of arrow join them:
//
//   block  -> branch      every branch, from the block it hangs out of
//   branch -> block       a branch's next part, when it has one
//   block  -> block       a plain link (an edge of kind `link`)
//
// Branches may rejoin and the story may loop (a hub you come back to, a branch
// that leads back to its own block), so the item graph is not a tree and not
// necessarily acyclic. The steps:
//
//   1. ROOTS. The `start` blocks; failing those, the blocks nothing leads to;
//      failing those (a graph that is one big loop), the first by sort_index.
//   2. BACK ARROWS. A depth-first walk from the roots marks every arrow that
//      leads back to an item still on the walk's stack. Those are the returns
//      - drawn as return arrows, and left out of ranking, which is what makes
//      the rest acyclic. Blocks no root reaches are walked afterwards, in
//      sort_index order, so they are still placed and their own loops are
//      still found. An arrow into a branch is never a return: a branch is
//      reached only from its own block.
//   3. RANKS. Over what is left, an item's rank is its longest path from an
//      item nothing leads to. Longest rather than shortest, so a rejoin sits
//      below every branch that rejoins there rather than beside the shortest.
//   4. ORDER WITHIN A RANK. A block by its sort_index first - the admin's own
//      say - then under its leftmost parent; a branch under its block, in its
//      own sort_index order among that block's branches. That keeps a block's
//      branches together under it and cuts most crossings.
//   5. PLACE. Every item has its own size (sizeOf, from its content). A rank
//      is as tall as its tallest item and the next rank starts a gap below
//      it; within a rank items sit side by side with a gap between them,
//      centred on x = 0, each vertically centred in its rank. So nothing
//      overlaps, whatever the sizes.

// --- Sizing -----------------------------------------------------------------
//
// React Flow would measure the DOM, but the layout must not, so an item's size
// is estimated from its text. The components apply the returned width and
// height inline and use the same paddings and line heights as below, so the
// estimate and the drawing cannot drift far: when the estimate is short, the
// text is clamped rather than spilling out.
//
// Text width is the character count times an average glyph width, a CJK
// character (or any other full-width one) counting double - close enough for
// the Noto Sans TC body face at these sizes.

/** Block (a story part): a rectangle. */
export const BLOCK = {
  MIN_WIDTH: 120,
  MAX_WIDTH: 220,
  PAD_X: 12, // px-3
  PAD_Y: 8, // py-2
  BORDER: 2, // 1px each side; a done block's ring sits outside the box
  CHAR: 6.5, // text-xs, average Latin glyph
  TITLE_LINE: 16, // text-xs leading-4
  TITLE_LINES: 2, // line-clamp-2
  ICON: 16, // the start or ending icon, with its gap
  EXCERPT_CHAR: 6, // text-[11px]
  EXCERPT_LINE: 14, // leading-[14px]
  EXCERPT_LINES: 2, // the shared description, line-clamp-2
  GAP: 4, // between the title and an excerpt (mt-1)
};

/** Branch (a choice or a condition): a pill. */
export const BRANCH = {
  MIN_WIDTH: 72,
  MAX_WIDTH: 180,
  PAD_X: 10, // px-2.5
  PAD_Y: 4, // py-1
  BORDER: 2,
  CHAR: 6, // text-[11px]
  TITLE_LINE: 14, // leading-[14px]
  TITLE_LINES: 2,
  ICON: 16, // the choice or condition icon, with its gap
  EXCERPT_CHAR: 5.5, // text-[10px]
  EXCERPT_LINE: 13, // leading-[13px]
  EXCERPT_LINES: 2,
  GAP: 2, // mt-0.5
};

/** Room between items in a rank, and between one rank and the next. */
export const CHOICE_COLUMN_GAP = 32;
export const CHOICE_RANK_GAP = 44;

// Full-width scripts: CJK ideographs and punctuation, kana, hangul, the
// full-width forms. Each such character is as wide as two Latin ones.
const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u;

/** Estimated width of `text` in px at `charWidth` per Latin character. */
export function textWidth(text, charWidth) {
  let units = 0;
  for (const ch of String(text || "")) units += WIDE.test(ch) ? 2 : 1;
  return units * charWidth;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Lines `width` px of text takes in a column `inner` px wide, at most `max`. */
const lineCount = (width, inner, max) => clamp(Math.ceil(width / inner), 1, max);

/**
 * The drawn size of one item, `{ width, height }`, from its content alone.
 *
 * `item` is `{ type: "block", node, note }` or `{ type: "branch", edge, note }`,
 * where `note` is the viewer's own note on it (or nothing). A title-only item
 * is compact: as wide as its title within the clamp, one or two lines tall. A
 * shared description takes the full width and adds a clamped excerpt; the
 * viewer's note takes the full width and adds one line.
 */
export function sizeOf(item) {
  const isBlock = item.type === "block";
  const S = isBlock ? BLOCK : BRANCH;
  const row = isBlock ? item.node : item.edge;
  const title = row?.title || "";
  const content = (row?.content || "").trim();
  const note = (item.note || "").trim();
  // A block shows an icon only for a start or an ending; a branch always does.
  const icon = !isBlock || row?.kind === "start" || row?.kind === "ending" ? S.ICON : 0;
  const titleWidth = textWidth(title, S.CHAR) + icon;

  const chrome = 2 * S.PAD_X + S.BORDER;
  const width =
    content || note ? S.MAX_WIDTH : clamp(Math.ceil(titleWidth + chrome), S.MIN_WIDTH, S.MAX_WIDTH);
  const inner = width - chrome;

  let height = 2 * S.PAD_Y + S.BORDER + lineCount(titleWidth, inner, S.TITLE_LINES) * S.TITLE_LINE;
  if (content) {
    height +=
      S.GAP + lineCount(textWidth(content, S.EXCERPT_CHAR), inner, S.EXCERPT_LINES) * S.EXCERPT_LINE;
  }
  if (note) height += S.GAP + S.EXCERPT_LINE;
  return { width, height };
}

// --- Layout -----------------------------------------------------------------

/** Edge kinds that are branches; the other kind is a plain `link`. */
export const BRANCH_KINDS = ["choice", "condition"];
export const isBranch = (edge) => BRANCH_KINDS.includes(edge?.kind);

const blockKey = (id) => `n:${id}`;
const branchKey = (id) => `e:${id}`;

const NO_MARKS = { nodes: new Map(), edges: new Map() };

/**
 * @param nodes the graph's blocks
 * @param edges the graph's branches and links
 * @param marks the viewer's marks, `{ nodes, edges }` id → mark (marksByTarget);
 *   only a note's presence matters here, since it adds a line to the item
 * @returns {{
 *   blocks: Object<string, {x, y, width, height, rank}>,
 *   branches: Object<string, {x, y, width, height, rank}>,
 *   arrows: Array<{id, kind, edgeId, from: {type, id}, to: {type, id}, isReturn}>,
 * }} positions are top-left corners; an arrow's `kind` is "branch-in"
 *   (block to branch), "branch-out" (branch to its next part) or "link"
 */
export function choiceLayout(nodes = [], edges = [], marks = NO_MARKS) {
  // Input order breaks every tie, so equal sort_index values stay stable.
  const nodeOrder = new Map(nodes.map((n, i) => [n.id, i]));
  const edgeOrder = new Map(edges.map((e, i) => [e.id, i]));
  const bySortIndex = (order) => (a, b) =>
    (a.sort_index ?? 0) - (b.sort_index ?? 0) || order.get(a.id) - order.get(b.id);
  const sortedNodes = [...nodes].sort(bySortIndex(nodeOrder));
  const known = new Set(nodeOrder.keys());

  // An edge out of a block the graph does not hold has nowhere to hang. A
  // branch whose next part is missing is still drawn, as a branch with none.
  const branches = edges
    .filter((e) => isBranch(e) && known.has(e.from_node_id))
    .sort(bySortIndex(edgeOrder));
  const links = edges
    .filter(
      (e) =>
        e.kind === "link" &&
        known.has(e.from_node_id) &&
        known.has(e.to_node_id) &&
        e.from_node_id !== e.to_node_id,
    )
    .sort(bySortIndex(edgeOrder));

  // Items, keyed so a block and a branch can never collide.
  const items = new Map();
  for (const n of sortedNodes) {
    items.set(blockKey(n.id), {
      key: blockKey(n.id),
      type: "block",
      id: n.id,
      row: n,
      size: sizeOf({ type: "block", node: n, note: marks.nodes.get(n.id)?.note }),
    });
  }
  for (const e of branches) {
    items.set(branchKey(e.id), {
      key: branchKey(e.id),
      type: "branch",
      id: e.id,
      row: e,
      size: sizeOf({ type: "branch", edge: e, note: marks.edges.get(e.id)?.note }),
    });
  }

  // Arrows. Out of a block, its branches come first and its links after, each
  // in sort_index order - the order the walk takes them.
  const arrows = [];
  const outgoing = new Map([...items.keys()].map((k) => [k, []]));
  const add = (arrow) => {
    arrows.push(arrow);
    outgoing.get(arrow.fromKey).push(arrow);
  };
  for (const e of branches) {
    add({
      id: `${e.id}:in`,
      kind: "branch-in",
      edgeId: e.id,
      fromKey: blockKey(e.from_node_id),
      toKey: branchKey(e.id),
      sort: e.sort_index ?? 0,
    });
    if (e.to_node_id && known.has(e.to_node_id)) {
      add({
        id: `${e.id}:out`,
        kind: "branch-out",
        edgeId: e.id,
        fromKey: branchKey(e.id),
        toKey: blockKey(e.to_node_id),
        sort: 0,
      });
    }
  }
  for (const e of links) {
    add({
      id: e.id,
      kind: "link",
      edgeId: e.id,
      fromKey: blockKey(e.from_node_id),
      toKey: blockKey(e.to_node_id),
      sort: e.sort_index ?? 0,
    });
  }

  // Whether a block has something leading into it from elsewhere. A branch
  // that leads back to its own block is a loop, not an entrance.
  const hasIncoming = new Set();
  for (const a of arrows) {
    if (a.kind === "branch-in") continue;
    const from = items.get(a.fromKey);
    const fromBlock = from.type === "block" ? from.id : from.row.from_node_id;
    if (blockKey(fromBlock) !== a.toKey) hasIncoming.add(a.toKey);
  }

  // 1. Roots.
  let roots = sortedNodes.filter((n) => n.kind === "start");
  if (!roots.length) roots = sortedNodes.filter((n) => !hasIncoming.has(blockKey(n.id)));
  if (!roots.length && sortedNodes.length) roots = [sortedNodes[0]];

  // 2. Back arrows, by an iterative DFS (a long story is a deep walk).
  const ON_STACK = 1;
  const DONE = 2;
  const state = new Map();
  const back = new Set();
  const walk = (start) => {
    if (state.has(start)) return;
    state.set(start, ON_STACK);
    const stack = [{ key: start, next: 0 }];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const out = outgoing.get(frame.key);
      if (frame.next >= out.length) {
        state.set(frame.key, DONE);
        stack.pop();
        continue;
      }
      const arrow = out[frame.next++];
      const seen = state.get(arrow.toKey);
      if (seen === ON_STACK) back.add(arrow.id);
      else if (!seen) {
        state.set(arrow.toKey, ON_STACK);
        stack.push({ key: arrow.toKey, next: 0 });
      }
    }
  };
  roots.forEach((n) => walk(blockKey(n.id)));
  sortedNodes.forEach((n) => walk(blockKey(n.id)));

  // 3. Ranks: longest path over the forward arrows, in topological order.
  const parents = new Map([...items.keys()].map((k) => [k, []]));
  const indegree = new Map([...items.keys()].map((k) => [k, 0]));
  for (const a of arrows) {
    if (back.has(a.id)) continue;
    parents.get(a.toKey).push(a);
    indegree.set(a.toKey, indegree.get(a.toKey) + 1);
  }
  const rank = new Map([...items.keys()].map((k) => [k, 0]));
  const queue = [...items.keys()].filter((k) => indegree.get(k) === 0);
  for (let i = 0; i < queue.length; i++) {
    const key = queue[i];
    for (const a of outgoing.get(key)) {
      if (back.has(a.id)) continue;
      rank.set(a.toKey, Math.max(rank.get(a.toKey), rank.get(key) + 1));
      indegree.set(a.toKey, indegree.get(a.toKey) - 1);
      if (indegree.get(a.toKey) === 0) queue.push(a.toKey);
    }
  }

  // 4 and 5. Order and place, rank by rank, so every parent is placed first.
  const layers = [];
  for (const item of items.values()) (layers[rank.get(item.key)] ||= []).push(item);
  const centreX = new Map();
  const placed = {};
  const nodeSort = new Map(nodes.map((n) => [n.id, n.sort_index ?? 0]));
  // The last tie-break: blocks before branches, then input order.
  const tie = (item) =>
    item.type === "block" ? nodeOrder.get(item.id) : nodes.length + edgeOrder.get(item.id);
  const sortKey = (item) => {
    // [primary sort_index, leftmost parent's x, place among that parent's arrows, tie]
    let parent = [Infinity, 0];
    for (const a of parents.get(item.key)) {
      const k = [centreX.get(a.fromKey) ?? Infinity, a.sort];
      if (k[0] < parent[0] || (k[0] === parent[0] && k[1] < parent[1])) parent = k;
    }
    // A branch has no say of its own across blocks: it follows its block's.
    const primary =
      item.type === "block" ? item.row.sort_index ?? 0 : nodeSort.get(item.row.from_node_id) ?? 0;
    return [primary, parent[0], parent[1], tie(item)];
  };
  const compare = (a, b) => {
    for (let i = 0; i < a.key.length; i++) {
      if (a.key[i] !== b.key[i]) return a.key[i] < b.key[i] ? -1 : 1;
    }
    return 0;
  };

  let top = 0;
  for (const layer of layers) {
    if (!layer?.length) continue;
    const keyed = layer.map((item) => ({ item, key: sortKey(item) })).sort(compare);
    const total =
      keyed.reduce((sum, { item }) => sum + item.size.width, 0) +
      CHOICE_COLUMN_GAP * (keyed.length - 1);
    const height = Math.max(...keyed.map(({ item }) => item.size.height));
    let left = -total / 2;
    for (const { item } of keyed) {
      const { width, height: h } = item.size;
      centreX.set(item.key, left + width / 2);
      placed[item.key] = { x: left, y: top + (height - h) / 2, width, height: h, rank: rank.get(item.key) };
      left += width + CHOICE_COLUMN_GAP;
    }
    top += height + CHOICE_RANK_GAP;
  }

  const blocks = {};
  const branchesOut = {};
  for (const item of items.values()) {
    (item.type === "block" ? blocks : branchesOut)[item.id] = placed[item.key];
  }
  const ref = (key) => ({ type: items.get(key).type, id: items.get(key).id });
  return {
    blocks,
    branches: branchesOut,
    arrows: arrows.map((a) => ({
      id: a.id,
      kind: a.kind,
      edgeId: a.edgeId,
      from: ref(a.fromKey),
      to: ref(a.toKey),
      isReturn: back.has(a.id),
    })),
  };
}
