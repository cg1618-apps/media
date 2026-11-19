# Single-entry groups remember the entry that was reviewed, not a flag

The review queue lists every franchise and series holding exactly one entry,
and one that is single on purpose can be marked "Reviewed – keep".

- **The mark is the reviewed entry's id** (`alone_reviewed_media_id`), and a
  group is listed when its one entry's id differs from it. If the reviewed
  entry moves out and another becomes the only one, the group comes back by
  itself: the decision made was not about the new entry.
- **Rejected: a boolean flag.** It hides the group for good unless every write
  path that moves an entry (create, update, delete, Pull, merge, the relation
  tools) resets it, and one missed path leaves a group hidden for a reason that
  no longer holds. Comparing ids needs no hook.
- **No foreign key to `media`.** Pull restores the Franchise and Series tabs
  before the Media tab, each committed on its own, so a restore into an empty
  database would insert a franchise naming a media row that does not exist yet.
  The column is a plain uuid like `cover_entry_id`; a stale id matches no live
  entry, so the group is listed again — what `SET NULL` would have done.
- **It travels.** `system_id` is preserved by Backup and Pull, and the parsers
  read the column only when the sheet has it, so restoring an older backup does
  not clear a review made since.
