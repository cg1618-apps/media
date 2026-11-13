// Frontend: the grouped read view of a structured section, as pure data.
//
// A section whose registry entry names `group_by` (a `names` field) is read
// one group per name rather than as one list - 亮點 Highlights draws a group per
// female character. The rules live here, apart from the component, so they can
// be tested on their own:
//
//   - a row naming two names appears in BOTH groups;
//   - rows inside a group keep the order they arrived in, which is
//     `sort_index` - there is no ordering of rows within a group;
//   - the groups follow the owner's stored order, and a name the order does
//     not mention is appended in the order it first appears;
//   - a name in the stored order that no row carries any more is skipped, and
//     drops out of the order the next time it is saved;
//   - a row naming nobody (the field is required, so only a hand-edited or
//     restored row) is not lost: it lands in one trailing group with no name.
//
// A section naming `groupable_by` (a `select` field, e.g. a skill's Type) is
// grouped the same way, one group per value, when the reader turns grouping
// on. There the value lives in a column rather than in `fields`, a row has
// exactly one, and no order is stored: the groups follow the rows'
// `sort_index`, which is how moving a group is saved (`groupedIds`).

/** A `names` value as a clean list: strings only, trimmed, blanks dropped. */
export function namesOf(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((n) => typeof n === "string")
    .map((n) => n.trim())
    .filter(Boolean);
}

/** The group names one row files under: a `names` list, or a column's value. */
function groupNamesOf(note, groupBy, column) {
  if (column) return namesOf([note[column]]);
  return [...new Set(namesOf((note.fields || {})[groupBy]))];
}

/**
 * Split `notes` into groups by the names in `fields[groupBy]` - or, given a
 * `column`, by that column's single value.
 *
 * Returns `[{ name, notes }]`. `name` is `null` for the trailing group of rows
 * that name nobody, which is present only when such rows exist.
 */
export function groupNotes(notes, groupBy, order = [], column = null) {
  const byName = new Map();
  const unnamed = [];
  for (const note of notes) {
    const names = groupNamesOf(note, groupBy, column);
    if (!names.length) {
      unnamed.push(note);
      continue;
    }
    for (const name of names) {
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(note);
    }
  }

  const ordered = [];
  const seen = new Set();
  for (const name of namesOf(order)) {
    if (byName.has(name) && !seen.has(name)) {
      ordered.push(name);
      seen.add(name);
    }
  }
  // Map iteration order is insertion order, i.e. first appearance.
  for (const name of byName.keys()) {
    if (!seen.has(name)) ordered.push(name);
  }

  const groups = ordered.map((name) => ({ name, notes: byName.get(name) }));
  if (unnamed.length) groups.push({ name: null, notes: unnamed });
  return groups;
}

/**
 * The group order after moving the group at `from` to `to`, as the list of
 * names to save. The nameless trailing group is never part of it, and names
 * no row carries any more are left out, which is how a stale name drops.
 */
export function movedGroupOrder(groups, from, to) {
  const names = groups.map((g) => g.name).filter((n) => n !== null);
  if (from < 0 || from >= names.length || to < 0 || to >= names.length) {
    return names;
  }
  const next = [...names];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * The row ids of `groups` in drawn order - what PATCH /api/notes/reorder
 * takes. Only for single-valued grouping, where each row is in one group:
 * saving it makes the groups contiguous in `sort_index`, so their first-
 * appearance order IS the new group order.
 */
export function groupedIds(groups) {
  return groups.flatMap((g) => g.notes.map((n) => n.system_id));
}

/**
 * `groups` with the row at `from` in group `gi` moved to `to` - taken out and
 * put back there, as a drop does, so the rows between shift by one. A row
 * never leaves its group. An out-of-range move returns `groups` unchanged.
 */
export function movedRow(groups, gi, from, to) {
  return groups.map((g, i) => {
    const n = g.notes.length;
    if (i !== gi || from < 0 || from >= n || to < 0 || to >= n) return g;
    const notes = [...g.notes];
    const [moved] = notes.splice(from, 1);
    notes.splice(to, 0, moved);
    return { ...g, notes };
  });
}

// --- A hierarchical section grouped by a column ---------------------------
//
// 地理 Geography is both `hierarchical` and `groupable_by`. Only a top-level
// row carries a group (the backend refuses one on a child), so it is the ROOTS
// that are grouped, each drawn with its whole subtree. The functions below take
// tree nodes, `{ note, children }`, as the component's buildTree makes them.

/** The ids of `nodes` and everything under them, depth-first in drawn order. */
export function treeIds(nodes) {
  return nodes.flatMap((node) => [node.note.system_id, ...treeIds(node.children)]);
}

/**
 * The roots grouped by `column`'s value, as `[{ name, nodes }]`: first
 * appearance in the roots' order, and a trailing `name: null` group for roots
 * with no value, present only when there are such roots.
 */
export function groupRoots(roots, column) {
  const byId = new Map(roots.map((node) => [node.note.system_id, node]));
  return groupNotes(
    roots.map((node) => node.note),
    null,
    [],
    column,
  ).map((g) => ({ name: g.name, nodes: g.notes.map((n) => byId.get(n.system_id)) }));
}

/**
 * Every row id of `groups`, depth-first in drawn order, with the node at
 * `from` among `siblings` moved to `to`. `siblings` is matched by identity: a
 * group's `nodes` (a root moving within its group) or a node's `children` (a
 * child moving among its siblings). A row never changes group or parent by
 * moving. An out-of-range move returns the order unchanged.
 */
export function movedTreeIds(groups, siblings, from, to) {
  const n = siblings.length;
  let moved = siblings;
  if (from >= 0 && from < n && to >= 0 && to < n) {
    moved = [...siblings];
    const [node] = moved.splice(from, 1);
    moved.splice(to, 0, node);
  }
  const flatten = (nodes) =>
    (nodes === siblings ? moved : nodes).flatMap((node) => [
      node.note.system_id,
      ...flatten(node.children),
    ]);
  return groups.flatMap((g) => flatten(g.nodes));
}
