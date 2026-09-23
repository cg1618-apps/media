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

/** A `names` value as a clean list: strings only, trimmed, blanks dropped. */
export function namesOf(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((n) => typeof n === "string")
    .map((n) => n.trim())
    .filter(Boolean);
}

/**
 * Split `notes` into groups by the names in `fields[groupBy]`.
 *
 * Returns `[{ name, notes }]`. `name` is `null` for the trailing group of rows
 * that name nobody, which is present only when such rows exist.
 */
export function groupNotes(notes, groupBy, order = []) {
  const byName = new Map();
  const unnamed = [];
  for (const note of notes) {
    const names = [...new Set(namesOf((note.fields || {})[groupBy]))];
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
