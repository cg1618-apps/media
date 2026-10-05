# Game choice graph — design

Working scaffolding: delete this file in the commit that finishes the work,
after moving what is worth keeping into `docs/systems/game-choices.md`,
`docs/data-model.md`, `docs/api.md`, `docs/systems/notes.md` and
`docs/notes/decisions.md`.

**Status: design proposed, NOT yet approved. Nothing implemented.**

## Request (owner's words)

> I want to create a new note for game. It will not be the same as regular
> notes. It will be more like the relation system. The note is for the choices
> split. For example, we might encounter multiple options, which will lead to
> different path/ending. I want a graph for it. Note that we probably want a
> popup to show all for it as the graph could possibly grow large. In
> addition, I want to be able to link a save to a node in the graph.

Settled with the owner before this was written:

| Question | Answer |
| --- | --- |
| Whose graph | **One shared graph per game**, edited by catalogue admins. Saves stay personal and point into it. |
| Shape | **Branches may rejoin** — a directed graph, not a tree. |
| Content | **Nodes are points** (start, choice, scene, ending); **arrows are the options**, carrying the option text. |
| Display | **A small read-only preview card** on the Game page, plus **"View all"** opening a large popup with the whole graph and the editing. |

## What exists

- **Saves** are the personal `saves` note section (`app/utils/note_sections.py`,
  "存檔 Saves", owners `GAME_OWNERS`, group `todo`, shape `structured`). Its
  fields are `number`, `name`, `checkpoint`, `note` and `based_on`; `based_on`
  lives in `note.fields` JSONB. That JSONB is where the link goes.
- **Relations** (`media_relation`, `app/routers/media_relation.py`,
  `frontend/src/components/relations/`) are the model the owner pointed at:
  their own table, catalogue-scope writes (`manage.catalog`), drawn with
  `@xyflow/react` 12 and a hand-rolled layout (`frontend/src/lib/relationLayout.js`).
  The graph's fullscreen is a class swap in `RelationGraph.jsx`, not a modal.
- **Modals** have no shared base. Each file in `frontend/src/components/modals/`
  repeats one pattern; the large one is `AnnouncementModal.jsx`
  (`w-[95vw] max-w-5xl h-[90vh]`).
- **Game children** that travel by Sheets follow `game_copy`: uuid primary
  key, FK `game_id → media.system_id` ON DELETE CASCADE, its own `SheetTab`
  after "Game".

## Design

### Storage — two new tables, not note rows

```
game_choice_node
  id            uuid PK
  game_id       uuid NOT NULL  FK media.system_id ON DELETE CASCADE
  kind          text NOT NULL  CHECK in ('start','choice','scene','ending')
  title         text NOT NULL
  content       text NULL      -- free note on the point
  sort_index    int  NOT NULL DEFAULT 0   -- order within a layer
  created_at, updated_at

game_choice_edge
  id            uuid PK
  game_id       uuid NOT NULL  FK media.system_id ON DELETE CASCADE
  from_node_id  uuid NOT NULL  FK game_choice_node.id ON DELETE CASCADE
  to_node_id    uuid NOT NULL  FK game_choice_node.id ON DELETE CASCADE
  option        text NULL      -- the option text; NULL = "continues to"
  sort_index    int  NOT NULL DEFAULT 0   -- order of options out of one node
  created_at, updated_at
  CHECK from_node_id <> to_node_id
```

- `game_id` on the edge is denormalised so the whole graph is one indexed
  query per table and the Sheets tab can be read per game. The service
  refuses an edge whose two nodes belong to a different game than `game_id`
  (a CHECK cannot see across rows); a test pins it.
- Both `game` and `h-game` own a graph, matching `GAME_OWNERS`. The FK is onto
  `media`, as `game_copy`'s is, so one table covers both.
- **Cycles are allowed** (a hub you return to). Only self-loops are refused.
  Layout handles cycles by treating back edges as returns (below).
- One alembic revision creates both tables.

**Rejected: storing nodes as `note` rows** in a new catalogue section, with
edges as a JSONB list on the from-node. It would avoid two tables and two
Sheets tabs, which is the cost `docs/notes/decisions.md` warns about. It loses
on integrity: an edge is a row that names two other rows, and in JSONB
nothing removes it when either end is deleted. Every delete would have to scan
and rewrite sibling notes, and a missed path leaves arrows into nothing. The
relation system the owner named is its own table for the same reason.

### Linking a save to a node

- A new field on the `saves` section: `choice_node` ("At node"), stored in
  `note.fields["choice_node"]` as the node's uuid, exactly as `based_on` is
  stored. **No note migration and no Note-tab reshape**: `fields` already
  travels.
- The schema validates it on write: the uuid must be a node of the save's own
  game; anything else is a 422.
- **Deleting a node clears the link** on every save that names it, in the same
  transaction (one `UPDATE note … WHERE fields->>'choice_node' = :id`). Saves
  are personal, so this touches other users' rows; that is correct, because
  the node they named no longer exists.
- Many saves may sit on one node; a save sits on at most one.

### Sheets — two tabs

`"Game Choice Node"` then `"Game Choice Edge"`, placed after "Game Copy" in
`SHEET_TABS` (after the Media and entry tabs their FKs need; edges after
nodes). Plain uuid identity: rows are created by hand on one machine and
travel with their uuid, so neither tab belongs in `DERIVED_IDENTITY_KEYS`.
Parsers in `app/utils/formatter.py` beside `parse_game_copy_from_sheet`.

### API — `app/routers/game_choice.py`, prefix `/api/game-choice`

| Method | Path | Gate |
| --- | --- | --- |
| GET | `/graph?game_id=` | viewer may see the game (`require_visible_owner`) → `{nodes, edges}` |
| POST | `/nodes` | `manage.catalog` |
| PATCH | `/nodes/{id}` | `manage.catalog` |
| DELETE | `/nodes/{id}` | `manage.catalog`; cascades edges, clears save links |
| POST | `/edges` | `manage.catalog` |
| PATCH | `/edges/{id}` | `manage.catalog` |
| DELETE | `/edges/{id}` | `manage.catalog` |

Kept separate from the generic media factory, as `media_relation` is. The
endpoint does not send saves. The page already fetches the viewer's own
`saves` notes through `NotesProvider`, and overlays them client-side, so the
personal-scope filtering in `app/routers/note.py` stays the only place that
decides whose saves a viewer sees.

### Frontend

New `frontend/src/components/game-choices/`:

- **`ChoiceGraph.jsx`** — `@xyflow/react`, read-only or editable. Node style
  by kind; endings are visually distinct. Each node shows a small badge for
  the viewer's saves linked to it (slot numbers), with a tooltip listing them.
- **`choiceLayout.js`** (in `frontend/src/lib/`, beside `relationLayout.js`)
  — layered top-to-bottom layout. A DFS from the start nodes marks back
  edges; the rest form a DAG ranked by longest path; nodes within a rank are
  ordered by `sort_index` then by their parents' order to cut crossings. No
  positions are stored; the layout is a pure function of the rows, unit-tested.
- **`ChoiceGraphCard.jsx`** — the preview on the Game page: a fixed-height,
  non-interactive render fitted to view, plus a node/ending count and a
  **"View all"** button. An empty graph shows the empty state with an "Add the
  first point" action for admins.
- **`ChoiceGraphModal.jsx`** — the popup, on the `AnnouncementModal`
  pattern but wider (`w-[95vw] max-w-7xl h-[90vh]`), Escape closes, body
  scroll locked. Pan, zoom and minimap. Admins edit inside it: add a node,
  drag from a node's handle to another to create an option (a small form for
  the option text, after `ConnectPopup.jsx`), click a node or arrow to edit or
  delete it. Clicking a node opens a side panel with its note and the viewer's
  saves on it.
- **Data**: TanStack Query hooks over `api/endpoints.js`, invalidating the
  graph query on every write. The saves editor's `choice_node` field is a
  select of this game's nodes (title, grouped by kind).
- **Placement**: `Game.jsx` and `HGame.jsx`, as a card of its own after the
  Progress and Todo slip, which holds the saves it links to.

Edit controls are gated on `manage.catalog` (`isAdmin`), like relations.

### Tests

- API: CRUD per gate, with both the allow and the refuse case (a user
  without `manage.catalog` gets 401 on every write, and the fixture gives
  the game a node so refusal has something to refuse); cross-game edge
  refused; self-loop refused; node delete cascades edges and clears a linked
  save's `choice_node` while leaving its other fields; hidden game → 404.
- Saves: `choice_node` naming another game's node → 422.
- Pipelines: Backup then Pull round-trips both tabs, and a save's link still
  resolves afterwards.
- `test_migrations_build_the_schema.py` covers the revision.
- Frontend: `choiceLayout` on a tree, a rejoin and a cycle; the card's empty
  and populated states; the modal opens, closes on Escape, and hides edit
  controls for non-admins.

### Docs, in the same change

New `docs/systems/game-choices.md`; `docs/data-model.md` (both tables),
`docs/api.md`, `docs/systems/notes.md` (the `choice_node` save field),
`docs/entry-types.md` (game and h-game), `docs/data-actions.md` (two tabs),
and the storage decision in `docs/notes/decisions.md`.

## Out of scope

Per-user "reached this ending" tracking, conditions on options (flags or
affection points), and images on nodes. Each fits the tables above later as a
column.
