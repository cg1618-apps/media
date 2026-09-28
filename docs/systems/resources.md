# Resources

Last verified: 2026-09-28

## What this is for

The Resources page is one site-wide page of notes: links, plain text, and
text with inline links, organised into groups that nest to any depth. It
belongs to no entry, franchise or user - there is exactly one page, and
everyone who can read it reads the same tree. This doc covers the table, the
rules a node obeys, the endpoints, who may read and write, and the Google
Sheets tab. The page itself is described in `docs/frontend/pages.md`.

## Model

One table, `resource_node` (`app/models/resource.py`, `ResourceNode`). Every
node is a row; the tree is the `parent_id` column.

| Column | Type | Notes |
|---|---|---|
| `system_id` | UUID PK | |
| `parent_id` | UUID, indexed | FK → `resource_node.system_id`, `ON DELETE CASCADE`, `DEFERRABLE INITIALLY DEFERRED`. NULL is the top level |
| `kind` | text, NOT NULL | `group` or `item` |
| `title` | text | a group's name; an item's optional heading |
| `content` | text | an item's Markdown body; always NULL on a group |
| `sort_index` | float | order among the siblings of one parent |
| `created_at` / `updated_at` | datetime | Taipei time |

Groups and items are one table rather than two because they share one order:
inside a group, a sub-group can sit between two items, and two tables would
need their orders merged on every read and every drag.

An item's `content` is Markdown, so "a link", "plain text" and "text with
inline links" are one column rather than three shapes: `https://…` on its own,
a sentence, and `see [the docs](https://…)` are all just content. Rendering is
the frontend's business; the backend stores the string as given.

## Rules

- **A group has a non-blank `title` and no `content`.** An **item** has
  non-blank `content`; its `title` is optional. The router answers a violation
  with **422**, and `ck_resource_node_group_shape` /
  `ck_resource_node_item_shape` hold the same rule in the database, with
  `ck_resource_node_kind` limiting `kind` to the two values.
- **A node's parent is a group.** An item holds no children. A CHECK cannot
  read another row, so this lives in the router (`_require_group`).
- **`kind` never changes**, and `PATCH /{system_id}` does not move a node:
  both keys are ignored there. Moving is a reorder.
- **A new node appends** after its siblings, at `max(sort_index) + 1.0`
  among the children of its parent (or among the top level).
- **Reorder names the whole sibling list.** `PATCH /reorder` takes a parent
  and the complete new order of its children; every listed node is moved
  under that parent and given its position (0.0, 1.0, …) as `sort_index`. So
  one call reorders siblings, and one call moves a node into another group -
  the list is the target group's children with the arrival placed where it
  landed. The list must name **every** node already under the parent: a partial
  list would leave the unnamed nodes at stale indexes interleaved with the new
  ones, so it is refused (422) rather than half-applied. The group a node left
  keeps its remaining indexes, gaps included, which orders them the same.
- **No cycles.** A group cannot be moved under itself or under any of its
  descendants (422): the target parent's ancestor chain must not contain any
  node being moved.
- **Deleting a group deletes everything under it**, through the cascading
  FK, in one statement. Every delete is logged to `deleted_record` as type
  "Resource", named by the node's title or, for an untitled item, by the start
  of its content.
- **Reads return the tree.** `GET` reads every row and nests them in Python,
  each level sorted by `sort_index` (a NULL index sinks to the end; creation
  time breaks ties). The page is one small table, so this is simpler than a
  recursive query and costs nothing measurable.

## API

Router: `app/routers/resources.py`, prefix `/api/resources`. Full table in
`docs/api.md`.

| Method | Path | Gate |
|---|---|---|
| GET | `/api/resources` | any viewer (`get_viewer`, as the Quote list) |
| POST | `/api/resources` | `manage.catalog` |
| PATCH | `/api/resources/reorder` | `manage.catalog` |
| PATCH | `/api/resources/{system_id}` | `manage.catalog` |
| DELETE | `/api/resources/{system_id}` | `manage.catalog` |

Every node in a response has the same shape: `system_id`, `parent_id`,
`kind`, `title`, `content`, `sort_index`, `created_at`, `updated_at` and
`children` (always `[]` on a write's response). `/reorder` is declared before
`/{system_id}` so the dynamic route does not take "reorder" as an id.

## Who may read and write

Reading follows the Quote page: guests, members and admins all get the whole
tree. There is nothing for a content label to hide - a node names no entry,
franchise or series - so no visibility filter applies.

Writing is catalogue work, `require_manage_catalog`: the `super` role by
grant, `admin` through the root flag, and any role granted `manage.catalog`.
Everyone else gets the usual **401**. See `docs/authorization.md`.

## Sheets

The page travels as the **`Resources`** tab (`app/services/pipelines/tabs.py`,
parser `parse_resource_node_from_sheet` in `app/utils/formatter.py`), every
column in declaration order. Rows keep their `system_id`, so a Pull updates the
page in place rather than duplicating it.

The tab restores in one commit, so two things keep one bad row from costing
the whole page:

- `parent_id` is **deferred**, so a child row that precedes its parent on the
  tab is checked only at commit, when the parent has landed.
- Before its row loop, Pull runs `_unrestorable_resource_rows`
  (`app/services/pipelines/pull.py`) over the whole tab and **skips and
  reports** in `unresolved_refs` every row that breaks a shape rule, whose
  parent is neither on the tab nor already in this database, or whose parent
  is an item - and every row beneath one of those, which would otherwise name
  a parent that never lands.

Details of the tab registry and Pull are in `docs/data-actions.md`.

## Related

- `docs/data-model.md` — `resource_node`
- `docs/api.md` — Resources
- `docs/authorization.md` — `manage.catalog`
- `docs/data-actions.md` — the `Resources` tab
- `tests/api/test_resources.py`, `tests/api/test_resources_sheets.py`
