# A game's choice graph is three tables; the graph is shared, the marks personal

How the graph behaves is `systems/game-choices.md`; this is why it is shaped
that way.

- **Its own tables, not note rows.** Rejected: points as `note` rows in a
  catalogue section with each point's options as a JSONB list on it — no new
  table, no new Sheets tab, but an option is a row naming two other rows, and
  in JSONB nothing removes it when either end is deleted, so every delete would
  have to scan and rewrite sibling notes and one missed path leaves arrows into
  nothing. As tables, an edge's ends are foreign keys, a self-loop is a CHECK,
  and the one cross-row rule a CHECK cannot state — both ends belong to the
  edge's game — is a router check with a test. The cost is three Sheets tabs
  and their place in the restore order.
- **One shared graph per game; marks and notes on it are personal.** What a
  game's story offers is a fact about the game, written as catalogue data like
  a relation. Whether you reached an ending, and what you thought of a choice,
  is a `game_choice_mark` row per account, and the graph read returns only the
  viewer's own. A mark is a table rather than a personal note section for the
  same integrity reason: deleting a point must take every mark on it.
- **Layout is computed; no positions are stored.** A choice graph has an order
  of its own — where the story starts, which branch leads where — so the layout
  is read off the rows, and a stored position would be one more thing to travel
  by Sheets and fall out of step when a point is inserted. `sort_index` is the
  one hand-set input. Points are not draggable, because a dragged point would
  jump back on the next refetch.
- **Item sizes are estimated from content, not measured.** The layout spaces
  ranks by size, runs before a render and must stay a pure function the tests
  run without a DOM, so `sizeOf` estimates from the text within clamps and the
  components apply exactly that size.
- **Branches are drawn items with a nullable target.** A story is grown from a
  choice — write the choice, then "+ next part" — so a branch has a title and
  may lead nowhere, while a plain link has no text and needs a target. Deleting
  the block a branch leads to keeps the branch (`SET NULL`), since its text and
  marks are somebody's writing; a link into it is deleted. A branch never
  becomes a link nor the reverse: their invariants differ.
- **`condition` exists beside `choice`.** Not every split is the player's; drawn
  as a choice, a roll or an affection threshold would claim a decision the
  player never made. The two share every rule and differ only in icon and
  wording.
- **A save's link to a point lives in `note.fields`** (`choice_node`), so it
  needed no column on `note` and no tab reshape. The database cannot cascade
  into JSONB, so deleting a point strips `choice_node` from every note naming
  it in the same transaction — including other accounts' saves, since the point
  they named is gone. The graph endpoint sends no saves, so the notes router
  stays the one place deciding whose saves a viewer sees.
- **Marks Pull onto the installation owner, folded by their natural key**
  `(user_id, node_id, edge_id)`, because each machine mints its own mark ids.
  Nodes and edges keep plain uuid identity: they are drawn on one machine and
  travel.
- **Blank text is stored as NULL** on every free-text column, so "no text" has
  one representation.
