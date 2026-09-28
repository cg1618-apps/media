// Frontend: pure helpers for the Resources tree (/resources).
//
// The server returns the tree already nested and each level already sorted, so
// nothing here sorts. What lives here is the arithmetic of a move: which
// sibling list a node sits in, what that list becomes after the move, and
// whether a drop is allowed at all. The reorder endpoint takes the COMPLETE new
// child list of one parent, so every move function returns exactly that shape -
// `{ parent_id, ordered_ids }` - ready to send.

/** The child list of `parentId` (null for the top level), or null if absent. */
export function childrenOf(tree, parentId) {
  if (parentId === null || parentId === undefined) return tree;
  const parent = findNode(tree, parentId);
  return parent ? parent.children || [] : null;
}

/** The node with `id`, anywhere in the tree, or null. */
export function findNode(tree, id) {
  for (const node of tree) {
    if (node.system_id === id) return node;
    const hit = findNode(node.children || [], id);
    if (hit) return hit;
  }
  return null;
}

/** The parent id of the node with `id` (null at the top level), or undefined if absent. */
export function parentIdOf(tree, id, parentId = null) {
  for (const node of tree) {
    if (node.system_id === id) return parentId;
    const hit = parentIdOf(node.children || [], id, node.system_id);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/** How many nodes sit below `node`, at every depth. */
export function countDescendants(node) {
  return (node.children || []).reduce(
    (n, child) => n + 1 + countDescendants(child),
    0,
  );
}

/** The nodes below `node`, counted by kind: `{ group, item }`. */
export function countByKind(node) {
  const counts = { group: 0, item: 0 };
  const walk = (nodes) =>
    nodes.forEach((n) => {
      counts[n.kind] = (counts[n.kind] || 0) + 1;
      walk(n.children || []);
    });
  walk(node.children || []);
  return counts;
}

/**
 * Every group in reading order with its depth, for a "move to" list:
 * `[{ node, depth }]`.
 */
export function flattenGroups(tree, depth = 0) {
  return tree.flatMap((n) =>
    n.kind === "group"
      ? [{ node: n, depth }, ...flattenGroups(n.children || [], depth + 1)]
      : [],
  );
}

/**
 * Whether the node `draggedId` may become a child of `targetParentId`.
 *
 * The top level (null) always accepts. Otherwise the target has to be a group,
 * and it may not be the dragged node itself or anything below it - that would
 * put a group inside itself, which the tree cannot represent.
 */
export function canDropInto(tree, draggedId, targetParentId) {
  if (targetParentId === null || targetParentId === undefined) return true;
  const target = findNode(tree, targetParentId);
  if (!target || target.kind !== "group") return false;
  if (targetParentId === draggedId) return false;
  const dragged = findNode(tree, draggedId);
  if (!dragged) return false;
  return findNode(dragged.children || [], targetParentId) === null;
}

/**
 * Moves `id` one place up (-1) or down (+1) among its siblings.
 * Returns the reorder body, or null when there is nowhere to go.
 */
export function moveAmongSiblings(tree, id, direction) {
  const parentId = parentIdOf(tree, id);
  if (parentId === undefined) return null;
  const ids = childrenOf(tree, parentId).map((n) => n.system_id);
  const from = ids.indexOf(id);
  const to = from + direction;
  if (to < 0 || to >= ids.length) return null;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  return { parent_id: parentId, ordered_ids: ids };
}

/**
 * Places `id` in `targetParentId`'s child list at `index` (appended when
 * `index` is omitted). `index` counts the list as it is BEFORE the move, so a
 * drop onto a sibling further down the same list lands in that sibling's slot,
 * which is what the watch-order editor's drag does too.
 *
 * Returns the reorder body - the full new list of the TARGET parent - or null
 * when the drop is forbidden or changes nothing. The old parent needs no
 * request of its own: its remaining children keep their relative order.
 */
export function moveInto(tree, id, targetParentId, index) {
  const parent = targetParentId ?? null;
  if (!canDropInto(tree, id, parent)) return null;
  const currentParent = parentIdOf(tree, id);
  if (currentParent === undefined) return null;
  const before = childrenOf(tree, parent).map((n) => n.system_id);
  const from = before.indexOf(id);
  const ids = before.filter((x) => x !== id);
  let at = index === undefined ? ids.length : index;
  at = Math.max(0, Math.min(at, ids.length));
  ids.splice(at, 0, id);
  if (from !== -1 && ids.every((x, i) => x === before[i])) return null;
  return { parent_id: parent, ordered_ids: ids };
}

/**
 * The tree as it will read after a reorder body is applied, for an optimistic
 * update: every listed node is detached from wherever it was and the target's
 * children become exactly the listed nodes, in order.
 */
export function applyReorder(tree, { parent_id, ordered_ids }) {
  const byId = new Map();
  const collect = (nodes) =>
    nodes.forEach((n) => {
      byId.set(n.system_id, n);
      collect(n.children || []);
    });
  collect(tree);
  const moving = new Set(ordered_ids);

  const rebuild = (nodes, parentId) => {
    const kept = nodes
      .filter((n) => !moving.has(n.system_id))
      .map((n) => ({ ...n, children: rebuild(n.children || [], n.system_id) }));
    if ((parentId ?? null) !== (parent_id ?? null)) return kept;
    return ordered_ids
      .map((mid) => byId.get(mid))
      .filter(Boolean)
      .map((n, i) => ({
        ...n,
        parent_id: parent_id ?? null,
        sort_index: i,
        children: rebuild(n.children || [], n.system_id),
      }));
  };
  return rebuild(tree, null);
}
