# A studio relation is two rows, one per side

A relation between two studios shows on both studios' pages, and each side
carries its own remark: A's page can say B is its "animation subsidiary"
while B's page says A is its "parent company". So `studio_relation` stores a
relation as the pair (A, B) and (B, A), each row holding the remark its
`studio_id`'s page shows beside the other studio.

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
  entries, series and franchises with typed kinds and derived inverse labels;
  a studio relation has no kind and two real foreign keys, so cascading on
  delete is the database's job rather than a sweep's.

## What the choice costs

The pair can drift only if something other than
`app/services/domain/studio_relation.py` writes the table, so that module is
the only writer: it creates the other side's row when a relation is added and
removes both when one is removed. Pull restores the rows as they were backed
up, which is both sides.
