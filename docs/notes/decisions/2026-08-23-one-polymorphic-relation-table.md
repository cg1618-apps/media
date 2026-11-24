# One polymorphic relation table

Every typed link between two entries — sequel, alternative, derivation and the
rest — is a row in one `media_relation` table, with `(type, id)` endpoints. It replaced per-entry columns (`prequel_id`, `sequel_id`,
`alternative`), which held one link each and could never leave their own table.

- **A fact is stored once and read both ways.** A prequel is stored as a
  swapped sequel and a symmetric kind sorts its endpoints, so the unique
  constraint catches the duplicate a user would create from the other side.
- **Rejected: mirrored rows** (one row per direction). One fact could then
  exist as two rows that drift apart, and no constraint can tie them together.
- **Rejected: per-table JSONB lists of links.** Postgres enforces nothing inside
  them, and a link could not be queried from its far end.
- **Each endpoint is a composite foreign key onto `media`**, which spans every
  media table; see `2026-11-24-a-deleted-entry-takes-its-relations.md`.
- The franchise and collection picker on the relations page is a lens over the
  graph, not ownership.
