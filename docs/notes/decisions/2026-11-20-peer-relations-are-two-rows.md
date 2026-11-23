# A peer relation is two rows, one per side

A relation between two companies, or between two franchises, shows on both
pages, and each side carries its own remark: A's page can say B is its
"animation subsidiary" while B's page says A is its "parent company". So
`company_relation` and `franchise_relation` each store a relation as the pair
(A, B) and (B, A), each row holding the remark its owner's page shows beside
the other record.

## Why two rows

Each row is exactly what one page reads: "my related studios, with my
words for each" is `WHERE studio_id = :me`, one indexed lookup, and the same
shape for the library's `has_relations` count. A side's remark lives on that
side's row, so writing it never touches the other side.

## Rejected

- **One row per pair with two remark columns** (`studio_low_id`,
  `studio_high_id`, `remark_on_low`, `remark_on_high`, ordered by uuid so the
  unique key catches the reverse). Every read would have to ask which end it
  is and pick the matching remark, every writer would have to normalise the
  order, and the remark columns would be named after an ordering that means
  nothing to a reader.
- **One row per pair with a single shared remark.** The owner chose one
  remark per side: the words that describe B from A's side read wrongly on
  B's page.
- **`media_relation`'s FK-less `(type, id)` endpoints.** That table relates
  entries with typed kinds and derived inverse labels; a peer relation has no
  kind and two real foreign keys, so cascading on delete is the database's
  job rather than a sweep's.
- **One table for companies and franchises**, with an owner-type column. Two
  real foreign keys per kind are what make the cascade the database's; a
  polymorphic table would have to give them up. The rules are shared instead,
  in code: one `PeerRelations` class in `app/services/domain/peer_relation.py`,
  with an instance per table, so the kinds cannot drift apart in behaviour.
  Studios and publishers do share a table, because they relate to each other;
  see `2026-11-23-studios-and-publishers-relate-in-one-table.md`.

## What the choice costs

The pair can drift only if something other than `PeerRelations`
(`app/services/domain/peer_relation.py`) writes the tables, so it is the only
writer: it creates the other side's row when a relation is added and
removes both when one is removed. Pull restores the rows as they were backed
up, which is both sides.
