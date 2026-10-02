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
