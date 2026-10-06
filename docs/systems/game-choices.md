# Game Choices

Last verified: 2026-10-05

## What this is for

A game's choice graph maps where its story splits. Its **blocks** are the parts of the story: a start, a part, an ending. Out of a block hang **branches** - a **choice** the player makes, or a **condition** the game decides (a roll, an earlier decision, affection ≥ 5) - and each branch leads to at most one next block. A block may also **link** straight to another block, with no branch between them. Branches may rejoin, a branch may lead back to its own block, and the story may loop back to a hub, so it is a directed graph, not a tree. One graph per game or h-game, shared by everyone and written by catalogue admins. On top of it each person keeps their own **marks** - a done tick and a private note on any block or branch - and their own 存檔 Saves can each be pinned to the block they sit in.

The graph is drawn as a still preview card on the game and h-game detail pages, and opened whole in a popup ("View all") where it is browsed, marked and edited. This document describes the tables, the rules, the save link, the API, the frontend and the Sheets round trip, citing the code that implements each piece.

Nothing derives the graph. It exists because somebody drew it.

## Model

Three tables, `app/models/game_choice.py`, shaped by `alembic/versions/g1c2hgraph3_game_choice_graph.py` and `g2c3hbranch4_game_choice_branches.py`. All three hang off `media.system_id`, as `game_copy` does, so one set of tables covers game and h-game. Each table's primary key is `system_id`; the API sends it as `id`. Column order is the Sheets column order (`format_model_for_sheet` walks `__table__.columns`).

A block is a `game_choice_node` row. A branch and a link are both `game_choice_edge` rows, told apart by `kind`.

### Table `game_choice_node` — blocks

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `system_id` | UUID | no | PK, indexed. What a save's `fields.choice_node` names |
| `game_id` | UUID | no | FK `media.system_id` ON DELETE CASCADE |
| `kind` | String | no | `start`, `part` or `ending` (`NODE_KINDS`) |
| `title` | String | no | Stored trimmed |
| `content` | Text | yes | The block's shared description. Blank is stored as NULL |
| `sort_index` | Integer | no | Default `0`. Orders blocks within a layer of the drawn graph |
| `created_at` / `updated_at` | DateTime | yes | Taipei time via `get_taipei_now` |

| Constraint / index | Definition | Why |
| --- | --- | --- |
| `ck_game_choice_node_kind` | `kind IN ('start', 'part', 'ending')` | Pull cannot write a kind the editor would refuse |
| `ck_game_choice_node_title` | `btrim(title) <> ''` | A block needs a name, in the database as well as the router |
| `ix_game_choice_node_game` | `(game_id)` | A graph is read per game |

### Table `game_choice_edge` — branches and links

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `system_id` | UUID | no | PK, indexed |
| `game_id` | UUID | no | FK `media.system_id` ON DELETE CASCADE. Denormalised, so a whole graph is one query per table |
| `kind` | String | no | `choice` or `condition` (a branch, `BRANCH_KINDS`), or `link` (`LINK_KIND`) |
| `from_node_id` | UUID | no | FK `game_choice_node.system_id` ON DELETE CASCADE. The block it hangs out of |
| `to_node_id` | UUID | yes | FK `game_choice_node.system_id` ON DELETE **SET NULL**. A branch's next block, or NULL while it leads nowhere; never NULL on a link |
| `title` | Text | yes | A branch's text; NULL on a link |
| `content` | Text | yes | A branch's shared description; NULL on a link. Blank is stored as NULL |
| `sort_index` | Integer | no | Default `0`. Orders the edges out of one block |
| `created_at` / `updated_at` | DateTime | yes | |

| Constraint / index | Definition | Why |
| --- | --- | --- |
| `ck_game_choice_edge_kind` | `kind IN ('choice', 'condition', 'link')` | |
| `ck_game_choice_edge_link` | `kind <> 'link' OR (to_node_id IS NOT NULL AND title IS NULL AND content IS NULL)` | A link always leads somewhere and carries no text |
| `ck_game_choice_edge_branch_title` | `kind = 'link' OR (title IS NOT NULL AND btrim(title) <> '')` | A branch is its title |
| `ck_game_choice_edge_no_self` | `kind <> 'link' OR to_node_id <> from_node_id` | A link may not loop onto its own block; a branch may ("ask again") |
| `ix_game_choice_edge_game` | `(game_id)` | |
| `ix_game_choice_edge_from` / `ix_game_choice_edge_to` | `(from_node_id)` / `(to_node_id)` | A block delete finds its edges from both ends |

There is no unique constraint on the pair: two branches may leave one block for the same next block, and two links may join the same two blocks.

### Table `game_choice_mark`

One person's mark on one block or one branch.

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `system_id` | UUID | no | PK, indexed |
| `user_id` | UUID | no | FK `users.id` ON DELETE CASCADE |
| `game_id` | UUID | no | FK `media.system_id` ON DELETE CASCADE. Denormalised, as on the edge |
| `node_id` | UUID | yes | FK `game_choice_node.system_id` ON DELETE CASCADE |
| `edge_id` | UUID | yes | FK `game_choice_edge.system_id` ON DELETE CASCADE |
| `done` | Boolean | no | Default `false` |
| `note` | Text | yes | The person's own note. Blank is stored as NULL |
| `created_at` / `updated_at` | DateTime | yes | |

| Constraint / index | Definition | Why |
| --- | --- | --- |
| `ck_game_choice_mark_one_target` | `(node_id IS NULL) <> (edge_id IS NULL)` | A mark marks exactly one thing |
| `uq_game_choice_mark_node` | unique `(user_id, node_id)` WHERE `node_id IS NOT NULL` | One mark per person per block |
| `uq_game_choice_mark_edge` | unique `(user_id, edge_id)` WHERE `edge_id IS NOT NULL` | One mark per person per edge |
| `ix_game_choice_mark_game_user` | `(game_id, user_id)` | The graph read fetches one viewer's marks on one game |

A link takes no mark: `PUT /edges/{edge_id}/mark` on a link answers `422` "Only blocks and branches can be marked." (`mark_edge`). The table does not enforce it - a mark row cannot see its edge's kind - so the router is the only guard.

### The revision is irreversible

`g2c3hbranch4` folds the block kinds `choice` and `scene` into `part`, makes an edge with option text a `choice` titled with it and one without a `link`, renames `option` to `title`, and adds `kind` and `content`. It declares `irreversible = True`, so the platform's rollback will not run its downgrade: once folded, nothing records which part was a choice and which a scene. Run by hand, the downgrade turns every part into a `scene`, drops branch descriptions and reads a condition as an option - and refuses, changing nothing, while any branch leads nowhere or back to its own block, since the older shape cannot hold either.

## Rules

### Graph writes — `app/routers/game_choice.py`

| Rule | Behaviour | Where |
| --- | --- | --- |
| Owner | The game must exist, be visible to the caller and be a `game` or `h-game` (`GRAPH_OWNER_TYPES`, which is `GAME_OWNERS`). Hidden or missing → `404` "Game not found."; a visible entry of another type → `422` | `_require_game` (`require_visible_media`) |
| Block kind | One of the three, else `422` "Unknown node kind …" | `_validate_kind` |
| Block title | Trimmed; blank → `422` "A node needs a title." | `_validate_title` |
| Edge kind | One of the three, else `422` "Unknown edge kind …" | `_validated_edge` |
| Branch | Needs a title (`422` "A branch needs a title."). May have no `to_node_id`; may lead to its own block | `_validated_edge` |
| Link | Needs a target (`422` "A link must lead to a block."), carries no title or description (`422` "A link carries no title or description."), and may not lead to its own block (`422` "A link cannot lead back to its own block.") | `_validated_edge` |
| Same game | Every end an edge names must be a block of the edge's `game_id`, else `422` "Both ends of an edge must be blocks of the same game." A CHECK cannot see across rows, so the router is the only guard | `_validated_edge`, `node_of_game` |
| Blank text | A block's `content`, a branch's `title` and `content`, and a mark's `note` are trimmed, and a blank one is stored as NULL | `_blank_to_none`, `write_mark` |
| `sort_index` | Missing or null is `0` | `create_*`, `update_*` |
| Block PATCH | Only the fields sent (`kind`, `title`, `content`, `sort_index`); a block never moves to another game | `update_node` |
| Edge PATCH | Only the fields sent (`kind`, `to_node_id`, `title`, `content`, `sort_index`), and the merged row is checked as a new one would be. `kind` may switch between `choice` and `condition` only - a branch never becomes a link nor a link a branch (`422` "An edge may only switch between choice and condition."). `to_node_id` may be set or, on a branch, cleared with `null`; the block an edge hangs from never changes | `update_edge` |
| Next part | `POST /edges/{id}/next` creates a block (kind `part` unless sent, after every block already in the game by `sort_index`) and points the branch at it, in one commit. A link is `422` "Only a branch takes a next block, not a link."; a branch already leading somewhere is `409` "This branch already leads to a block." | `create_next` |
| Bad path id | Not a uuid, or names no row → `404` "Node not found." / "Edge not found." | `_uuid_or_404`, `_get_node_or_404`, `_get_edge_or_404` |

### Deletes

| Delete | What goes with it |
| --- | --- |
| A block | Every edge **out** of it, and every mark on the block or on those edges (foreign keys). Every **link into** it, deleted by the router first, since `SET NULL` would leave a link the CHECK refuses. Every **branch into** it survives, leading nowhere again (`ON DELETE SET NULL`), so its title, description and marks are kept. `choice_node` is removed from the `fields` of every note naming the block (`clear_save_links`). The block and every edge that goes are logged to the deleted-record log (`"Game Choice Node"`, `"Game Choice Edge"`). One commit covers all of it. |
| An edge | Its marks (foreign key). Logged as `"Game Choice Edge"`. The blocks it joins are untouched. |
| A game | All three tables' rows for it (foreign keys onto `media`). |
| A user | Their marks (foreign key onto `users`). |

The deleted-record row names a block by its title and records its kind; it names a branch by its title, and a link - which has none - by the two blocks it joins, with the edge's kind as the category.

`clear_save_links` is one `UPDATE note SET fields = fields - 'choice_node' WHERE fields->>'choice_node' = :node_id`, so the rest of each save's fields are left as they were. Saves are personal, so this rewrites other users' rows; that is correct, because the block they named no longer exists.

### Personal marks — `write_mark` in `app/services/domain/game_choice.py`

The graph is shared, but whether you have played a part or taken a choice, and what you thought of it, is yours. A mark is that: `done` plus a `note`, on one block or one branch.

- **Who may write one**: a signed-in account holding `self.personal_notes` - the same gate as a personal note. Anyone else gets `401` "You may not write personal notes." (`_authorize_mark`). The root flag does not cover the `self` family (`Viewer.has`), so the `admin` account holds no marks and cannot write one, as it holds no personal notes.
- **Who sees one**: only its owner. The graph read returns the caller's own marks, and `[]` for a caller who may not hold any (a guest, the `admin` account) (`_viewer_marks_user`).
- **An upsert of the whole mark**: `PUT` sends `{done, note}`; the row is created or overwritten. A mark that is not done and has no note says nothing, so it is deleted rather than stored, and the response carries `id: null`.
- Marking needs the game visible, as reading it does.

### The save link

A save (the personal 存檔 Saves note section, `saves` in `app/utils/note_sections.py`) has an **At node** field, key `choice_node`, of the field type `choice_node` (`FIELD_CHOICE_NODE`). It holds a block's uuid in `note.fields["choice_node"]`, beside `based_on`; there is no column for it and no migration of `note`. A save sits in a block, never on a branch.

| Rule | Where |
| --- | --- |
| The value must be a string that parses as a uuid | `_check_field` in `app/schemas/note.py` (422 via `validate_note_payload`) |
| It must name a block of the note's **own** game | `_require_choice_nodes` in `app/routers/note.py`, on POST and on the merged row of a PATCH: `422` "At node must be a node of this game's choice graph." |
| A blank value clears the link and is not checked | same |
| Many saves may sit in one block; a save sits in at most one | the field is one value |
| Deleting the block removes the key from every save naming it | `clear_save_links` |

The graph endpoint does not send saves. The page already holds the viewer's own `saves` rows through its `NotesProvider`, so the notes router stays the only place that decides whose saves a viewer sees, and the graph overlays them client-side.

## API

Router: `app/routers/game_choice.py`, prefix `/api/game-choice`, kept apart from the generic media factory as `media_relation` is. Schemas: `app/schemas/game_choice.py`. Frontend endpoint map: `endpoints.gameChoice` in `frontend/src/api/endpoints.js`.

| Method & path | Auth | Params / body | Response | Errors |
| --- | --- | --- | --- | --- |
| `GET /graph` | public, viewer-aware | query `game_id` | `GameChoiceGraphResponse` `{nodes, edges, marks}`. Node: `id, game_id, kind, title, content, sort_index`. Edge: `id, game_id, kind, from_node_id, to_node_id, title, content, sort_index`. Mark: `id, node_id, edge_id, done, note`. Nodes and edges ordered by `sort_index`, then creation; marks are the caller's own | `404` game hidden or unknown; `422` not a game |
| `POST /nodes` | `manage.catalog` | `GameChoiceNodeCreate`: `game_id, kind, title, content?, sort_index?` | `201` node | `404`; `422` kind / title / not a game |
| `PATCH /nodes/{node_id}` | `manage.catalog` | `GameChoiceNodeUpdate`: any of `kind, title, content, sort_index` | node | `404`; `422` |
| `DELETE /nodes/{node_id}` | `manage.catalog` | — | `204` | `404` |
| `PUT /nodes/{node_id}/mark` | `self.personal_notes` | `GameChoiceMarkWrite`: `done, note?` | `GameChoiceMarkResponse`; `id: null` when the write removed the mark | `401`; `404` |
| `POST /edges` | `manage.catalog` | `GameChoiceEdgeCreate`: `game_id, kind, from_node_id, to_node_id?, title?, content?, sort_index?` | `201` edge | `404`; `422` per the rules above |
| `PATCH /edges/{edge_id}` | `manage.catalog` | `GameChoiceEdgeUpdate`: any of `kind, to_node_id, title, content, sort_index` | edge | `404`; `422` |
| `POST /edges/{edge_id}/next` | `manage.catalog` | `GameChoiceNextCreate`: `title, kind? = "part", content?` | `201` `GameChoiceNextResponse` `{node, edge}` - the new block and the branch now leading to it | `404`; `409` the branch already leads somewhere; `422` a link, or a bad block kind or title |
| `DELETE /edges/{edge_id}` | `manage.catalog` | — | `204` | `404` |
| `PUT /edges/{edge_id}/mark` | `self.personal_notes` | as the node mark | as the node mark, for a branch | `401`; `404`; `422` the edge is a link |

A missing capability is `401`, as everywhere ([../authorization.md](../authorization.md)).

## UI

Files: `frontend/src/components/game-choices/`, `frontend/src/lib/choiceLayout.js`, `frontend/src/api/mutations/useGameChoiceMutations.js`. Drawn with `@xyflow/react`, as the relations canvas is.

### Where it appears

| Surface | Component | Mode |
| --- | --- | --- |
| `Game.jsx`, `HGame.jsx`: the 分歧 Choices slip right after the Progress and Todo slip, inside the page's `NotesProvider` | `ChoiceGraphCard` | still preview |
| "View all" from that card | `ChoiceGraphModal` | browse, mark, edit |
| A save's form and row in the 存檔 Saves section | `ChoiceNodeSelect`, `ChoiceNodeName` (`ChoiceNodeField.jsx`), rendered by `StructuredSection` for a `choice_node` field | a select of this game's blocks (never branches), grouped Start / Part / Ending; a tag "At node: {title}" |

### Data

`useChoiceGraph(gameId)` is the one read, keyed `["game-choice-graph", gameId]`; every write (`useCreateChoiceNode`, `usePatchChoiceNode`, `useDeleteChoiceNode`, `useCreateChoiceEdge`, `usePatchChoiceEdge`, `useDeleteChoiceEdge`, `useCreateNextPart`, `useSetChoiceMark`) invalidates it when it settles. No optimistic update: the graph is small and the layout is a pure function of the rows. The card, the modal and every save's select share that one query, so the page fetches the graph once however many saves it lists.

`useChoiceGraphView(gameId)` adds the viewer's saves: it reads `notes` and `reloadNotes` from the page's provider through `useOptionalNotes()`, and `savesByNode` groups the `saves` rows by their `fields.choice_node`. Outside a provider there are simply no save badges. After a block is deleted the modal calls `reloadNotes`, since the server has just cleared every save's link to it. The pure readers of the rows are in `choiceGraphData.js` (`BLOCK_KINDS`, `BRANCH_KINDS`, `branchesFrom`, `linksFrom`, `nextEdgeSortIndex`, `graphCounts`, `blocksOfKind`, `nodesByKind`, `marksByTarget`, `savesByNode`).

### Card — `ChoiceGraphCard.jsx`

A still picture: fixed height (`h-64`), fitted to view, no pan, zoom or clicks. Its header carries the counts - "n parts · n choices · n endings", where parts counts every block (starts and endings included) and choices counts both kinds of branch, and, for a viewer who can mark, "x / y endings done" - and **View all**. Loading, error and empty states each read in place. An empty graph says "No story parts yet." and offers a manage.catalog holder **Add the first block**, which opens the modal on the new-block form. The preview canvas is re-mounted whenever the number of items or arrows changes, so it fits again.

### Popup — `ChoiceGraphModal.jsx`

The `AnnouncementModal` pattern, wider: `w-[95vw] max-w-7xl h-[90vh]`, at `z-[90]`. Clicking the backdrop or pressing Escape closes it. The page behind stops scrolling while it is open, and gets its scroll back however the popup goes away. Three columns:

- **The canvas** in the middle: pan, zoom, controls and a minimap. An admin sees a hint for dragging; a drag that the server refuses shows its error at the canvas's foot.
- **The right rail** (`w-64`): the story's **Starts** and **Endings**, each a collapsible list with its count. An item expands in place to its description and, for a viewer who can mark, whether it is done and their note; an ending also shows a done tick in the list. **Show in graph** centres the canvas on the block and selects it. The rail is open by default and hidden or shown by **Starts & endings** in the header.
- **The left drawer** (`w-80`): opens with whatever is selected or being written, and closes with its own button or a click on the empty canvas. It is on the opposite side from the rail, so opening it never moves the lists being read.

| Drawer | Shows | Actions (`isAdmin`) |
| --- | --- | --- |
| A block | kind, title, shared description, "My saves here", its branches (each with its next block, or "no next part yet") and its links - each opens that edge | **+ Add choice**, **+ Add condition** (title and description), **+ Link to block** (pick another block), **Edit block**, **Delete block** |
| A branch | kind with its icon, title, description, the block it hangs from and the block it leads to (or "No next part yet.") | **Add next part** (a new block, kind Part, Ending or Start - through `POST /edges/{id}/next`, then the drawer opens the new block), **Link to existing block** (any block, its own included), **Clear next part**, **Edit choice/condition** (kind switch, title, description), **Delete** |
| A link | "From {a} straight to {b}" | **Delete link** |
| New block | kind, title, description; **Add block** in the header opens it. The kinds offered start with Start on an empty graph and with Part otherwise | |

For a viewer holding `self.personal_notes` (`canMark`), a block's and a branch's drawer also holds **Mine**: a **Done** checkbox that saves as it is ticked, and **My note**, which saves on blur.

Dragging on the canvas (admin only): from a block's bottom handle onto another block adds a **link**; from a branch's bottom handle onto any block - its own included - sets that block as the branch's **next part** and opens the branch. Nothing is ever dropped onto a branch (`connectionIntent` in `ChoiceGraph.jsx`). On the editable canvas, a branch with no next part also carries a **+ next part** button under its pill, which opens the branch's drawer on the new-block form. A new block takes `sort_index` after every existing block; a new edge the next after the edges already leaving its block (`nextEdgeSortIndex`). Deletes confirm in place rather than through `ConfirmModal`, whose own Escape listener would close the popup with it.

Items are never dragged: positions are not stored, so a hand-placed item would jump back on the next refetch.

### Permissions in the page

Two different gates, as on the server. `isAdmin` (AuthContext: holds `manage.catalog`) shows every edit control. `canMark` is `has("self.personal_notes")`; AuthContext's `has` mirrors the server in leaving the `self` family out of the root short-circuit, so the `admin` account sees no Mine section and no "endings done" count. Hiding is cosmetic: the server refuses what the page hides.

### Layout — `frontend/src/lib/choiceLayout.js`

`choiceLayout(nodes, edges, marks)` returns `{blocks, branches, arrows}`: a top-left position, a size and a rank for every block and every branch, and the arrows between them. Pure, DOM-free, unit-tested (`choiceLayout.test.js`); the same rows always draw the same way.

Two kinds of **item** are laid out: a block, and a branch, which is drawn as its own pill under its block and so takes a place in the layout like a block does. Three kinds of **arrow** join them: block → branch (every branch, from its block), branch → block (a branch's next part, when it has one) and block → block (a link). A branch whose block is not in the graph is not drawn; one whose next block is missing is drawn as a branch with none. The steps:

1. **Roots**: the `start` blocks; failing those, the blocks nothing leads to (a branch looping onto its own block is not an entrance); failing those, the first by `sort_index`.
2. **Back arrows**: an iterative depth-first walk from the roots marks every arrow that leads back to an item still on the walk's stack. Those are returns, drawn differently and left out of ranking, which makes the rest acyclic. Blocks no root reaches are walked afterwards, in `sort_index` order. An arrow into a branch is never a return.
3. **Ranks**: an item's rank is its longest path from an item nothing leads to - longest, so a rejoin sits below every branch that rejoins there.
4. **Order within a rank**: a block by its `sort_index`, then under its leftmost parent; a branch under its block, in its own `sort_index` order among that block's branches.
5. **Place**: a rank is as tall as its tallest item, the next starts `CHOICE_RANK_GAP` (44) below it, and items sit side by side `CHOICE_COLUMN_GAP` (32) apart, centred on x = 0, each vertically centred in its rank. Nothing overlaps, whatever the sizes.

**Sizes are estimated from the content, not measured.** `sizeOf(item)` computes an item's width and height from its title, its shared description and the viewer's note, with `textWidth(text, charWidth)` counting a CJK or other full-width character as two Latin ones. A title-only item is as wide as its title within a clamp and one or two lines tall; a description widens it to the maximum and adds a two-line excerpt; the viewer's note adds one line. The constants live in `BLOCK` (120-220 px wide) and `BRANCH` (72-180 px), and the components apply the computed size inline with the same paddings and line heights, so layout and drawing agree; text the estimate fell short of is clamped rather than spilling out.

### Drawing — `ChoiceGraph.jsx`, `ChoiceNode.jsx`, `ChoiceBranch.jsx`, `ChoiceEdge.jsx`

- **A block** (`ChoiceNode`) is a plain rectangle, sized by `sizeOf`. Kind is drawn only where it matters to the story's shape: a start carries a play icon, an ending a flag; a part carries nothing. A block with a description shows a two-line excerpt; one holding the viewer's note shows a one-line excerpt of it behind a note icon.
- **A branch** (`ChoiceBranch`) is a pill on an accent tint, in smaller type, so it is never mistaken for a block, led by its kind's icon - `fa-code-branch` for a choice, `fa-circle-question` for a condition. A title-only pill is fully round; one with a description or note rounds only its corners and carries the excerpts. In React Flow it is a node whose id is prefixed `branch:`, so it cannot collide with a block's.
- **Done** is the accent: a done block or branch gets a brand border, ring and check, and the arrows into and out of a done branch are drawn thicker in the brand colour.
- **Saves**: a block with saves in it wears a badge at its corner - a disk icon and the slot numbers - with a tooltip listing each save.
- **Arrows** (`ChoiceEdge`) carry no text: a branch's words are on its pill. A forward arrow is a curve from the bottom of one item to the top of the next. A **return** (a back arrow) is a dashed, stepped line out of the right side of the later item into the right side of the earlier block, so a loop reads as "goes back to" rather than as one more branch. Return handles are never offered for a drag. Clicking an arrow selects its branch or link.
- Stroke colours come from theme tokens through `tokenColor` (exported by `components/relations/RelationGraph.jsx`), because React Flow's arrowhead markers cannot resolve `var(...)`. `colorMode` follows `useThemeOrLight()`.

## Sheets

Three tabs, registered in `app/services/pipelines/tabs.py` right after "Game Copy", for the same reason: each table's `game_id` is a real FK onto `media`. Order: **"Game Choice Node"**, then **"Game Choice Edge"** (both ends are FKs onto nodes), then **"Game Choice Mark"** (it names one node or one edge). Parsers: `parse_game_choice_node_from_sheet`, `parse_game_choice_edge_from_sheet`, `parse_game_choice_mark_from_sheet` in `app/utils/formatter.py`.

- **Blocks and edges travel with their uuid.** They are written by hand on one machine, and a save's `fields.choice_node` names a block by that uuid, so the Note tab, further down the list, needs nothing translated. The edge tab's columns are `system_id, game_id, kind, from_node_id, to_node_id, title, content, sort_index, created_at, updated_at`; a blank `to_node_id` is a branch leading nowhere. A sheet row breaking a CHECK - a bad kind, a blank title, a link with no target or with text - fails the tab at its commit.
- **An older edge tab still Pulls.** A sheet backed up before edges had a kind carries `option` and neither `kind` nor `title`. The parser reads the option text as the title and derives the kind from it - text was a `choice`, none a `link` - which is what the revision did to the stored rows; Pull puts the two derived keys back after its header filter, only when the sheet carries neither. `RENAMED_HEADERS` in `pull.py` lists `option` for the tab, so the header is not reported as unexpected. Its node tab is read the same way: `parse_game_choice_node_from_sheet` reads a block of the old kind `choice` or `scene` as a `part`, as the revision did, so the whole older graph restores.
- **Marks are personal and restored like Game Copy.** Pull files every mark under the installation owner (`installation_owner_id`) rather than the `user_id` the sheet carries, which names whichever database wrote it; with no account at all the row is skipped. Marks are written through the page on each machine, so the same person's mark carries a different `system_id` here and there: "Game Choice Mark" is in `DERIVED_IDENTITY_KEYS` (`app/services/pipelines/pull.py`) with the natural key `(user_id, node_id, edge_id)` - what the two partial unique indexes name, the unset one compared as `IS NULL` - so a mark whose uuid is unknown here updates the local mark on the same block or edge rather than inserting beside it.

The full tab list and its ordering contract are in [../data-actions.md](../data-actions.md).

## Related

- Tests: `tests/api/test_game_choice.py` (gates with both the allow and the refuse case, the branch and link rules, deletes and save links, marks), `tests/api/test_game_choice_sheets.py` (the round trip, an older edge tab, and a whole older graph), `tests/api/test_game_choice_branches_migration.py` (the revision both ways, and the downgrade's refusal), `tests/unit/test_game_note_sections.py` (the `choice_node` field); frontend `frontend/src/lib/choiceLayout.test.js`, the `*.test.jsx` files in `frontend/src/components/game-choices/`, and `frontend/src/pages/notes/sections/StructuredSection.choiceNode.test.jsx`.
- Why the graph has tables of its own, why it is shared while marks are personal, why no positions are stored, why the save link is a note field, why branches are drawn items with nullable targets, and why the revision is irreversible: [../notes/decisions.md](../notes/decisions.md) ("A game's choice graph is three tables; the graph is shared, the marks personal").
- The notes registry and the Saves section: [notes.md](notes.md). The relations canvas this is modelled on: [relations.md](relations.md).
