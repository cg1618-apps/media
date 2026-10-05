# Game Choices

Last verified: 2026-10-05

## What this is for

A game's choice graph maps where its story splits: the points you reach (a start, a choice, a scene, an ending) and the options that lead from one to the next. Branches may rejoin and the story may loop back to a hub, so it is a directed graph, not a tree. One graph per game or h-game, shared by everyone and written by catalogue admins. On top of it each person keeps their own **marks** - a done tick and a private note on any point or option - and their own 存檔 Saves can each be pinned to the point they sit at.

The graph is drawn as a still preview card on the game and h-game detail pages, and opened whole in a popup ("View all") where it is browsed, marked and edited. This document describes the tables, the rules, the save link, the API, the frontend and the Sheets round trip, citing the code that implements each piece.

Nothing derives the graph. It exists because somebody drew it.

## Model

Three tables, `app/models/game_choice.py`, created by `alembic/versions/g1c2hgraph3_game_choice_graph.py`. All three hang off `media.system_id`, as `game_copy` does, so one set of tables covers game and h-game. Each table's primary key is `system_id`; the API sends it as `id`. Column order is the Sheets column order (`format_model_for_sheet` walks `__table__.columns`).

### Table `game_choice_node`

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `system_id` | UUID | no | PK, indexed. What a save's `fields.choice_node` names |
| `game_id` | UUID | no | FK `media.system_id` ON DELETE CASCADE |
| `kind` | String | no | `start`, `choice`, `scene` or `ending` (`NODE_KINDS`) |
| `title` | String | no | Stored trimmed |
| `content` | Text | yes | The point's shared description. Blank is stored as NULL |
| `sort_index` | Integer | no | Default `0`. Orders points within a layer of the drawn graph |
| `created_at` / `updated_at` | DateTime | yes | Taipei time via `get_taipei_now` |

| Constraint / index | Definition | Why |
| --- | --- | --- |
| `ck_game_choice_node_kind` | `kind IN ('start', 'choice', 'scene', 'ending')` | Pull cannot write a kind the editor would refuse |
| `ck_game_choice_node_title` | `btrim(title) <> ''` | A point needs a name, in the database as well as the router |
| `ix_game_choice_node_game` | `(game_id)` | A graph is read per game |

### Table `game_choice_edge`

One option: an arrow from one point to another, carrying the option's text.

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `system_id` | UUID | no | PK, indexed |
| `game_id` | UUID | no | FK `media.system_id` ON DELETE CASCADE. Denormalised, so a whole graph is one query per table |
| `from_node_id` | UUID | no | FK `game_choice_node.system_id` ON DELETE CASCADE |
| `to_node_id` | UUID | no | FK `game_choice_node.system_id` ON DELETE CASCADE |
| `option` | Text | yes | The option text. NULL reads "continues to"; blank is stored as NULL |
| `sort_index` | Integer | no | Default `0`. Orders the options out of one point |
| `created_at` / `updated_at` | DateTime | yes | |

| Constraint / index | Definition | Why |
| --- | --- | --- |
| `ck_game_choice_edge_no_self` | `from_node_id <> to_node_id` | A self-loop is the one shape refused |
| `ix_game_choice_edge_game` | `(game_id)` | |
| `ix_game_choice_edge_from` / `ix_game_choice_edge_to` | `(from_node_id)` / `(to_node_id)` | A node delete finds its edges from both ends |

There is no unique constraint on the pair: two different options may lead from one point to the same other point.

### Table `game_choice_mark`

One person's mark on one point or one option.

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
| `uq_game_choice_mark_node` | unique `(user_id, node_id)` WHERE `node_id IS NOT NULL` | One mark per person per point |
| `uq_game_choice_mark_edge` | unique `(user_id, edge_id)` WHERE `edge_id IS NOT NULL` | One mark per person per option |
| `ix_game_choice_mark_game_user` | `(game_id, user_id)` | The graph read fetches one viewer's marks on one game |

## Rules

### Graph writes — `app/routers/game_choice.py`

| Rule | Behaviour | Where |
| --- | --- | --- |
| Owner | The game must exist, be visible to the caller and be a `game` or `h-game` (`GRAPH_OWNER_TYPES`, which is `GAME_OWNERS`). Hidden or missing → `404` "Game not found."; a visible entry of another type → `422` | `_require_game` (`require_visible_media`) |
| Kind | One of the four, else `422` "Unknown node kind …" | `_validate_kind` |
| Title | Trimmed; blank → `422` "A node needs a title." | `_validate_title` |
| Blank text | A node's `content`, an edge's `option` and a mark's `note` are trimmed, and a blank one is stored as NULL | `_blank_to_none`, `write_mark` |
| `sort_index` | Missing or null is `0` | `create_*`, `update_*` |
| Self-loop | `422` "An option cannot lead back to its own node."; the CHECK says the same so Pull cannot write one | `create_edge` |
| Same game | Both ends must be nodes of the edge's `game_id`, else `422` "Both ends of an option must be nodes of the same game." A CHECK cannot see across rows, so the router is the only guard | `create_edge`, `node_of_game` |
| Rejoins and cycles | Allowed: any number of options may lead into one point, and an option may lead back to an earlier one | |
| Node PATCH | Only the fields sent (`kind`, `title`, `content`, `sort_index`); a node never moves to another game | `update_node` |
| Edge PATCH | `option` and `sort_index` only. Repointing an arrow is deleting it and drawing the right one, so a PATCH never re-checks the ends | `update_edge`, `GameChoiceEdgeUpdate` |
| Bad path id | Not a uuid, or names no row → `404` "Node not found." / "Edge not found." | `_uuid_or_404`, `_get_node_or_404`, `_get_edge_or_404` |

### Deletes

| Delete | What goes with it |
| --- | --- |
| A node | Every edge from or to it, and every mark on the node or on those edges (foreign keys). The node and each of those edges are logged to the deleted-record log (`"Game Choice Node"`, `"Game Choice Edge"`), and `choice_node` is removed from the `fields` of every note naming the node (`clear_save_links`). One commit covers all of it. |
| An edge | Its marks (foreign key). Logged as `"Game Choice Edge"`. The two nodes are untouched. |
| A game | All three tables' rows for it (foreign keys onto `media`). |

In the deleted-record log a node is named by its title (`name_cn`, with its kind as `category`), and an edge by its option text - or, for a plain "continues to" arrow with none, by "{from title} → {to title}" (`log_deleted_record` in `app/utils/data_control_utils.py`).
| A user | Their marks (foreign key onto `users`). |

`clear_save_links` is one `UPDATE note SET fields = fields - 'choice_node' WHERE fields->>'choice_node' = :node_id`, so the rest of each save's fields are left as they were. Saves are personal, so this rewrites other users' rows; that is correct, because the point they named no longer exists.

### Personal marks — `write_mark` in `app/services/domain/game_choice.py`

The graph is shared, but whether you have reached a point or taken an option, and what you thought of it, is yours. A mark is that: `done` plus a `note`, on one point or one option.

- **Who may write one**: a signed-in account holding `self.personal_notes` - the same gate as a personal note. Anyone else gets `401` "You may not write personal notes." (`_authorize_mark`). The root flag does not cover the `self` family (`Viewer.has`), so the `admin` account holds no marks and cannot write one, as it holds no personal notes.
- **Who sees one**: only its owner. The graph read returns the caller's own marks, and `[]` for a caller who may not hold any (a guest, the `admin` account) (`_viewer_marks_user`).
- **An upsert of the whole mark**: `PUT` sends `{done, note}`; the row is created or overwritten. A mark that is not done and has no note says nothing, so it is deleted rather than stored, and the response carries `id: null`.
- Marking needs the game visible, as reading it does.

### The save link

A save (the personal 存檔 Saves note section, `saves` in `app/utils/note_sections.py`) has an **At node** field, key `choice_node`, of the field type `choice_node` (`FIELD_CHOICE_NODE`). It holds a node's uuid in `note.fields["choice_node"]`, beside `based_on`; there is no column for it and no migration of `note`.

| Rule | Where |
| --- | --- |
| The value must be a string that parses as a uuid | `_check_field` in `app/schemas/note.py` (422 via `validate_note_payload`) |
| It is stored canonical: the lowercase hyphenated uuid, no whitespace | `_canonical_fields` in `app/routers/note.py`. `clear_save_links` matches `fields->>'choice_node'` exactly and the page compares ids as strings, so an uppercase or padded copy would miss both |
| It must name a node of the note's **own** game | `_require_choice_nodes` in `app/routers/note.py`: always on POST; on a PATCH only when it sends `fields` and the value differs from the stored one, or when the PATCH moves the note to another owner. `422` "At node must be a node of this game's choice graph." A save whose stored link names a point this machine does not hold (brought by Pull without its graph) can therefore still be renamed or reordered |
| A blank value clears the link: the key is removed from `fields`, and nothing is checked | same |
| Many saves may sit on one point; a save sits on at most one | the field is one value |
| Deleting the point removes the key from every save naming it | `clear_save_links` |

The graph endpoint does not send saves. The page already holds the viewer's own `saves` rows through its `NotesProvider`, so the notes router stays the only place that decides whose saves a viewer sees, and the graph overlays them client-side.

## API

Router: `app/routers/game_choice.py`, prefix `/api/game-choice`, kept apart from the generic media factory as `media_relation` is. Schemas: `app/schemas/game_choice.py`. Frontend endpoint map: `endpoints.gameChoice` in `frontend/src/api/endpoints.js`.

| Method & path | Auth | Params / body | Response | Errors |
| --- | --- | --- | --- | --- |
| `GET /graph` | public, viewer-aware | query `game_id` | `GameChoiceGraphResponse` `{nodes, edges, marks}`. Node: `id, game_id, kind, title, content, sort_index`. Edge: `id, game_id, from_node_id, to_node_id, option, sort_index`. Mark: `id, node_id, edge_id, done, note`. Nodes and edges ordered by `sort_index`, then creation; marks are the caller's own | `404` game hidden or unknown; `422` not a game |
| `POST /nodes` | `manage.catalog` | `GameChoiceNodeCreate`: `game_id, kind, title, content?, sort_index?` | `201` node | `404`; `422` kind / title / not a game |
| `PATCH /nodes/{node_id}` | `manage.catalog` | `GameChoiceNodeUpdate`: any of `kind, title, content, sort_index` | node | `404`; `422` |
| `DELETE /nodes/{node_id}` | `manage.catalog` | — | `204` | `404` |
| `PUT /nodes/{node_id}/mark` | `self.personal_notes` | `GameChoiceMarkWrite`: `done, note?` | `GameChoiceMarkResponse`; `id: null` when the write removed the mark | `401`; `404` |
| `POST /edges` | `manage.catalog` | `GameChoiceEdgeCreate`: `game_id, from_node_id, to_node_id, option?, sort_index?` | `201` edge | `404`; `422` self-loop / ends not of this game |
| `PATCH /edges/{edge_id}` | `manage.catalog` | `GameChoiceEdgeUpdate`: any of `option, sort_index` | edge | `404` |
| `DELETE /edges/{edge_id}` | `manage.catalog` | — | `204` | `404` |
| `PUT /edges/{edge_id}/mark` | `self.personal_notes` | as the node mark | as the node mark | `401`; `404` |

A missing capability is `401`, as everywhere ([../authorization.md](../authorization.md)).

## UI

Files: `frontend/src/components/game-choices/`, `frontend/src/lib/choiceLayout.js`, `frontend/src/api/mutations/useGameChoiceMutations.js`. Drawn with `@xyflow/react`, as the relations canvas is.

### Where it appears

| Surface | Component | Mode |
| --- | --- | --- |
| `Game.jsx`, `HGame.jsx`: the 分歧 Choices slip right after the Progress and Todo slip, inside the page's `NotesProvider` | `ChoiceGraphCard` | still preview |
| "View all" from that card | `ChoiceGraphModal` | browse, mark, edit |
| A save's form and row in the 存檔 Saves section | `ChoiceNodeSelect`, `ChoiceNodeName` (`ChoiceNodeField.jsx`), rendered by `StructuredSection` for a `choice_node` field | a select of this game's points; a tag "At node: {title}" |

### Data

`useChoiceGraph(gameId)` is the one read, keyed `["game-choice-graph", gameId]`; every write (`useCreateChoiceNode`, `usePatchChoiceNode`, `useDeleteChoiceNode`, `useCreateChoiceEdge`, `usePatchChoiceEdge`, `useDeleteChoiceEdge`, `useSetChoiceMark`) invalidates it when it settles. No optimistic update: the graph is small and the layout is a pure function of the rows. The card, the modal and every save's select share that one query, so the page fetches the graph once however many saves it lists.

`useChoiceGraphView(gameId)` adds the viewer's saves: it reads `notes` and `reloadNotes` from the page's provider through `useOptionalNotes()`, and `savesByNode` groups the `saves` rows by their `fields.choice_node`. Outside a provider there are simply no save badges. After a point is deleted the modal calls `reloadNotes`, since the server has just cleared every save's link to it.

### Card — `ChoiceGraphCard.jsx`

A still picture: fixed height (`h-64`), fitted to view, no pan, zoom or clicks. Its header carries the counts - points and endings, and, for a viewer who can mark, how many endings they have marked done - and **View all**. Loading, error and empty states each read in place. An empty graph says "No choice points yet." and offers a manage.catalog holder **Add the first point**, which opens the modal on the new-point form. The preview canvas is re-mounted whenever the number of points or options changes, so it fits again.

### Popup — `ChoiceGraphModal.jsx`

The `AnnouncementModal` pattern, wider: `w-[95vw] max-w-7xl h-[90vh]`, at `z-[90]`. Clicking the backdrop or pressing Escape closes it - except while a new option is waiting to be confirmed, when Escape cancels that instead. The page behind stops scrolling while it is open, and gets its scroll back however the popup goes away. The canvas pans and zooms and carries controls and a minimap.

A right-hand side panel (`w-80`) shows whatever is selected or being written; clicking the empty canvas closes a point's or an option's panel, and every panel has its own close button.

| Panel | Shows | For |
| --- | --- | --- |
| A point | kind, title, shared description, "My saves here", the options out of it (each opens that option) | everyone |
| An option | its text (or "Continues"), and from and to | everyone |
| Mine | a **Done** checkbox that saves as it is ticked, and **My note**, which saves on blur | `canMark` |
| Edit point / Delete point | the point form; delete asks once more in place | `isAdmin` |
| Option text / Delete option | edit the text, or delete | `isAdmin` |
| New point | kind, title, description; **Add point** in the header opens it | `isAdmin` |
| New option | "From {a} to {b}" and the option text (blank: continues to), after `ConnectPopup` - nothing is written until it is confirmed | `isAdmin` |

An admin draws an option by dragging from a point's bottom handle onto another point's top handle; a drop on the same point, or on any other handle, is refused before the form opens. A new point takes the next `sort_index` after every existing point, and a new option the next after the options already leaving its point. The delete confirmation is in place rather than `ConfirmModal`, whose own Escape listener would close the popup with it.

Points are never dragged: positions are not stored, so a hand-placed point would jump back on the next refetch.

### Permissions in the page

Two different gates, as on the server. `isAdmin` (AuthContext: holds `manage.catalog`) shows every edit control. `canMark` is `has("self.personal_notes")`; AuthContext's `has` mirrors the server in leaving the `self` family out of the root short-circuit, so the `admin` account sees no Mine panel and no "endings done" count. Hiding is cosmetic: the server refuses what the page hides.

### Layout — `frontend/src/lib/choiceLayout.js`

`choiceLayout(nodes, edges)` returns `{positions, ranks, backEdges}`. Pure, DOM-free, unit-tested (`choiceLayout.test.js`); the same rows always draw the same way. Layered top to bottom:

1. **Roots**: the `start` points; failing those, the points nothing leads to; failing those (the whole graph is one loop), the first by `sort_index`.
2. **Back edges**: an iterative depth-first walk from the roots marks every option that leads back to a point still on the walk's stack. Those are returns, drawn differently and left out of ranking, which makes the rest acyclic. Points no root reaches are walked afterwards, in `sort_index` order.
3. **Ranks**: over the remaining options, a point's rank is its longest path from a point nothing leads to - longest, so a rejoin sits below every branch that rejoins there.
4. **Order within a rank**: by `sort_index` first, then under the leftmost parent and by the option's own `sort_index` out of it, which keeps a branch's children under it. Each rank is centred on x = 0.

Node size is fixed (`CHOICE_NODE_WIDTH` 180, `CHOICE_NODE_HEIGHT` 64) and the pitch is computed from it (`CHOICE_COLUMN`, `CHOICE_RANK`, the rank gap tall enough for an option label). An option naming a point not in the graph is not drawn.

### Drawing — `ChoiceGraph.jsx`, `ChoiceNode.jsx`, `ChoiceEdge.jsx`

- **Every point is the same plain block** holding only its title, on a plain canvas: the graph is blocks and arrows. Kind is not drawn; it shows in the side panel and in the card's endings count.
- **Done** is the accent: a done point gets a brand border and a check; a done option a thicker brand stroke and a check on its label. A point or option holding the viewer's note shows a note icon.
- **Saves**: a point with saves on it wears a badge at its corner - a disk icon and the slot numbers - with a tooltip listing each save.
- **Options** are curves from the bottom of one point to the top of the next, labelled with the option text through `EdgeLabelRenderer`. A **return** (a back edge) is a dashed, stepped line out of the right side of the later point into the right side of the earlier one, with a return icon on its label, so a loop reads as "goes back to" rather than as one more branch. Return handles are never offered for a drag. On the interactive canvas a label is also a click target.
- Stroke colours come from theme tokens through `tokenColor` (exported by `components/relations/RelationGraph.jsx`), because React Flow's arrowhead markers cannot resolve `var(...)`. `colorMode` follows `useThemeOrLight()`.

## Sheets

Three tabs, registered in `app/services/pipelines/tabs.py` right after "Game Copy", for the same reason: each table's `game_id` is a real FK onto `media`. Order: **"Game Choice Node"**, then **"Game Choice Edge"** (both ends are FKs onto nodes), then **"Game Choice Mark"** (it names one node or one edge). Parsers: `parse_game_choice_node_from_sheet`, `parse_game_choice_edge_from_sheet`, `parse_game_choice_mark_from_sheet` in `app/utils/formatter.py`.

- **Nodes and edges travel with their uuid.** They are written by hand on one machine, and a save's `fields.choice_node` names a node by that uuid, so the Note tab, further down the list, needs nothing translated. A sheet row with a bad `kind`, a blank title or a self-loop fails the CHECKs at the tab's commit.
- **Marks are personal and restored like Game Copy.** Pull files every mark under the installation owner (`installation_owner_id`) rather than the `user_id` the sheet carries, which names whichever database wrote it; with no account at all the row is skipped. Marks are written through the page on each machine, so the same person's mark carries a different `system_id` here and there: "Game Choice Mark" is in `DERIVED_IDENTITY_KEYS` (`app/services/pipelines/pull.py`) with the natural key `(user_id, node_id, edge_id)` - what the two partial unique indexes name, the unset one compared as `IS NULL` - so a mark whose uuid is unknown here updates the local mark on the same point or option rather than inserting beside it.

The full tab list and its ordering contract are in [../data-actions.md](../data-actions.md).

## Related

- Tests: `tests/api/test_game_choice.py` (gates with both the allow and the refuse case, cross-game and self-loop refusals, deletes and save links, marks), `tests/api/test_game_choice_sheets.py` (the round trip), `tests/unit/test_game_note_sections.py` (the `choice_node` field); frontend `frontend/src/lib/choiceLayout.test.js`, the `*.test.jsx` files in `frontend/src/components/game-choices/`, and `frontend/src/pages/notes/sections/StructuredSection.choiceNode.test.jsx`.
- Why the graph has tables of its own, why it is shared while marks are personal, why no positions are stored and why the save link is a note field: [../notes/decisions.md](../notes/decisions.md) ("A game's choice graph is three tables; the graph is shared, the marks personal").
- The notes registry and the Saves section: [notes.md](notes.md). The relations canvas this is modelled on: [relations.md](relations.md).
