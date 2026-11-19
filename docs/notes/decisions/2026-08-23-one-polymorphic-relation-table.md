# One polymorphic relation table

Every typed link between two entries — sequel, alternative, derivation and the
rest — is a row in one `media_relation` table, with FK-less `(type, id)`
endpoints. It replaced per-entry columns (`prequel_id`, `sequel_id`,
`alternative`), which held one link each and could never leave their own table.

- **A fact is stored once and read both ways.** A prequel is stored as a
  swapped sequel and a symmetric kind sorts its endpoints, so the unique
  constraint catches the duplicate a user would create from the other side.
- **Rejected: mirrored rows** (one row per direction). One fact could then
  exist as two rows that drift apart, and no constraint can tie them together.
- **Rejected: per-table JSONB lists of links.** Postgres enforces nothing inside
  them, and a link could not be queried from its far end.
- **The endpoints carry no foreign key** because no single key can span the
  media tables; a deleted endpoint is served as `missing` rather than dropped,
  so it stays visible and fixable.
- The franchise and collection picker on the relations page is a lens over the
  graph, not ownership.
