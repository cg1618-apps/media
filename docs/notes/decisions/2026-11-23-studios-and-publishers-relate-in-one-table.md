# Studios and publishers relate in one table, with an FK column per kind

A studio may relate to a publisher - an animation studio and the label that
distributes it - as well as to another studio, and a publisher to either. So
`studio_relation` became `company_relation`, whose each end is a studio or a
publisher. Franchises still relate only to franchises: a grouping tier
relates to its own tier, and `franchise_relation` is unchanged.

- **Each end is two nullable FK columns, exactly one set** (`studio_id` or
  `publisher_id`; `related_studio_id` or `related_publisher_id`), checked by
  `num_nonnulls`. That keeps a real foreign key per kind, so deleting a
  company cascades in the database, and it fits the Pull: each column is
  translated through its own tab (`DERIVED_IDENTITY_PARENTS`), as `User
  Rating`'s three owner columns already are.
- **Rejected: a `kind` column beside one untyped id per end**, the
  `media_relation` shape. It gives up the foreign keys and the cascade, and
  the Pull's id translation, which maps a column to one parent tab, could not
  follow it.
- **Rejected: a third table for studio-publisher pairs** beside
  `studio_relation` and a new `publisher_relation`. One relation would live in
  whichever table its pair of kinds picked, and every reader would ask three
  tables and union them.
- **Two rows per relation, as before** (`2026-11-20-peer-relations-are-two-rows.md`):
  each side keeps its own remark, and `PeerRelations` - now holding a tuple
  of kinds - is still the only writer.
- **The sheet tab is renamed** `Company Relation`; a sheet from before still
  restores, read under its old title through `LEGACY_TAB_NAMES`, since its
  columns kept their names.
