// Frontend: the arithmetic behind reordering a watch order in the editor.
//
// The editor draws blocks (part boxes and the loose runs between them), but a
// move is easiest to reason about on a flat stream of *tokens*: one per step,
// plus one per EMPTY part, in the order the page draws them. A part with steps
// needs no token of its own - it is drawn around its steps wherever they are.
// An empty part has no steps to carry it, so its token is the only thing that
// says where its box sits.
//
// Every move rewrites the token stream and then derives the one request that
// commits it (`orderPayload`): the step order, each step's part, and a position
// for every part. Sending every part's position on every move keeps an empty
// part where it is drawn while the steps around it are renumbered 1..N.

/** The flat token stream the blocks are drawn from. */
export function buildTokens(blocks) {
  const tokens = [];
  for (const block of blocks) {
    if (block.kind === "part" && block.rows.length === 0) {
      tokens.push({ kind: "empty", section: block.section });
    } else {
      for (const row of block.rows) tokens.push({ kind: "item", item: row.item });
    }
  }
  return tokens;
}

const itemsOf = (tokens) =>
  tokens.filter((t) => t.kind === "item").map((t) => t.item);

const findItem = (tokens, itemId) =>
  tokens.findIndex((t) => t.kind === "item" && t.item.system_id === itemId);

/**
 * Which part a moved step ends up in when nothing says explicitly.
 *
 * It adopts the run it lands in, read off its new neighbours: the one they
 * agree on, else the step above it, else the step below. Every answer extends
 * an existing run rather than starting a second one, so a move can never split
 * a part - which is the invariant the server enforces and would otherwise
 * reject the request for.
 *
 * The practical reading: nudging a step down past the last step of its part
 * takes it out of that part, and nudging one up into the middle of a part puts
 * it in.
 */
export function adoptedSection(reordered, index) {
  const previous = index > 0 ? reordered[index - 1] : null;
  const next = index + 1 < reordered.length ? reordered[index + 1] : null;
  const above = previous ? previous.section_id || null : null;
  const below = next ? next.section_id || null : null;
  if (previous && next && above === below) return above;
  if (previous) return above;
  return below;
}

/**
 * Takes one step out of the stream and puts it back at `place`, filed under
 * `sectionId`.
 *
 * `place` is `{ before: token }`, `{ after: token }`, `{ replace: emptyToken }`
 * (filling an empty part where it is drawn) or `{ end: true }`.
 *
 * A part the step leaves with no steps at all stays drawn where the step was,
 * as an empty part, rather than jumping to wherever its old position said.
 */
export function placeStep(tokens, sections, itemId, place, sectionId) {
  const next = [...tokens];
  const from = findItem(next, itemId);
  if (from < 0) return null;
  const moved = next[from].item;
  const hole = { kind: "hole", sectionId: moved.section_id || null };
  next[from] = hole;

  const token = { kind: "item", item: { ...moved, section_id: sectionId } };
  if (place.end) {
    next.push(token);
  } else if (place.replace) {
    next.splice(next.indexOf(place.replace), 1, token);
  } else {
    const anchor = next.indexOf(place.before ?? place.after);
    if (anchor < 0) return null;
    next.splice(place.before ? anchor : anchor + 1, 0, token);
  }

  // A part filled by this move needs no empty token any more, wherever it was.
  const filled = next.findIndex(
    (t) => t.kind === "empty" && t.section.system_id === sectionId
  );
  if (filled >= 0) next.splice(filled, 1);

  const holeAt = next.indexOf(hole);
  const left = hole.sectionId;
  const stillHasSteps = next.some(
    (t) => t.kind === "item" && (t.item.section_id || null) === left
  );
  const section = sections.find((s) => s.system_id === left);
  if (left && !stillHasSteps && section) {
    next[holeAt] = { kind: "empty", section };
  } else {
    next.splice(holeAt, 1);
  }
  return next;
}

/**
 * Moves the step at flat index `from` to flat index `to`, the way the typed
 * position box, the arrow keys and a drop onto a row all mean it: it ends up
 * at `to` in the step order. `sectionId` names its part when the gesture says
 * so (a drop onto a row takes that row's part) and is left undefined by the
 * box and the keys, which infer it from the new neighbours.
 */
export function moveStepByIndex(tokens, sections, from, to, sectionId) {
  const items = itemsOf(tokens);
  if (from < 0 || from >= items.length || to < 0 || to >= items.length) {
    return null;
  }
  const reordered = [...items];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to, 0, moved);
  const landed =
    sectionId === undefined ? adoptedSection(reordered, to) : sectionId;
  // A step can only change part by moving: the empty-part case, where it
  // stays put and fills the box, goes through moveStepIntoPart.
  if (from === to) return null;
  const target = tokenAt(tokens, items[to]);
  const place = from < to ? { after: target } : { before: target };
  return placeStep(tokens, sections, moved.system_id, place, landed);
}

function tokenAt(tokens, item) {
  return tokens[findItem(tokens, item.system_id)];
}

/**
 * A drop on a part's own chrome rather than one of its rows: the step joins
 * the end of that part, or becomes the first step of an empty one, landing
 * where that empty part is drawn.
 */
export function moveStepIntoPart(tokens, sections, itemId, sectionId) {
  const emptyToken = tokens.find(
    (t) => t.kind === "empty" && t.section.system_id === sectionId
  );
  if (emptyToken) {
    return placeStep(tokens, sections, itemId, { replace: emptyToken }, sectionId);
  }
  const inPart = tokens.filter(
    (t) => t.kind === "item" && t.item.section_id === sectionId
  );
  if (!inPart.length) return null;
  const last = inPart[inPart.length - 1];
  if (last.item.system_id === itemId) return null;
  return placeStep(tokens, sections, itemId, { after: last }, sectionId);
}

/**
 * A drop in the gap before `blocks[blockIndex]` (the tail when it is past the
 * last block). The step lands there filed under no part - the only landing
 * spot that unfiles it, and the only way to put a step between two parts.
 */
export function moveStepIntoGap(tokens, sections, blocks, itemId, blockIndex) {
  // The block's first token: its first step, or itself when it is an empty
  // part. Counting the tokens of the blocks before it finds that index.
  let at = 0;
  for (let i = 0; i < blockIndex && i < blocks.length; i += 1) {
    at += blocks[i].kind === "part" && !blocks[i].rows.length ? 1 : blocks[i].rows.length;
  }
  let anchor = tokens[at];
  // Dropped in the gap right above itself: anchor on whatever follows it.
  if (anchor?.kind === "item" && anchor.item.system_id === itemId) {
    anchor = tokens[at + 1];
  }
  const place = anchor ? { before: anchor } : { end: true };
  return placeStep(tokens, sections, itemId, place, null);
}

/** Moves a whole block - a part with every step in it - to index `to`. */
export function moveBlock(blocks, from, to) {
  if (from === to || from < 0 || to < 0 || from >= blocks.length || to >= blocks.length) {
    return null;
  }
  const order = [...blocks];
  const [moved] = order.splice(from, 1);
  order.splice(to, 0, moved);
  return buildTokens(order);
}

/**
 * The request a token stream commits, and the sections as they will read.
 *
 * Steps are renumbered 1..N in stream order. A part with steps is positioned
 * at its first step; an empty part between two steps, k steps in, gets a
 * fraction strictly between k and k+1 - spread evenly when several empty parts
 * sit together, so they keep their order - which is where the guide's
 * buildBlocks draws it.
 */
export function orderPayload(tokens, sections) {
  const items = [];
  const positions = new Map();
  let pendingEmpties = [];

  const flushEmpties = () => {
    const k = items.length;
    pendingEmpties.forEach((section, j) => {
      positions.set(section.system_id, k + (j + 1) / (pendingEmpties.length + 1));
    });
    pendingEmpties = [];
  };

  for (const token of tokens) {
    if (token.kind === "empty") {
      pendingEmpties.push(token.section);
      continue;
    }
    flushEmpties();
    items.push(token.item);
    const sectionId = token.item.section_id || null;
    if (sectionId && !positions.has(sectionId)) {
      positions.set(sectionId, items.length);
    }
  }
  flushEmpties();

  const sectionPositions = sections.map((s) => ({
    section_id: s.system_id,
    position: positions.get(s.system_id) ?? s.position,
  }));

  return {
    items,
    sections: sections.map((s) =>
      positions.has(s.system_id) ? { ...s, position: positions.get(s.system_id) } : s
    ),
    body: {
      item_ids: items.map((i) => i.system_id),
      section_ids: items.map((i) => i.section_id || null),
      section_positions: sectionPositions,
    },
  };
}

/** True when a move would change nothing the page draws. */
export function changesNothing(currentItems, payload) {
  if (currentItems.length !== payload.items.length) return false;
  return currentItems.every(
    (item, i) =>
      item.system_id === payload.items[i].system_id &&
      (item.section_id || null) === (payload.items[i].section_id || null)
  );
}
