# Highlights are each account's own, and so is their group order

The highlight sections are an opinion of the work, so they are personal note
sections.

- **The group order is a table, not a hidden note section.**
  `user_highlight_group_order (user_id, media_id, group_order)` has the
  `user_rating` shape: one row per account per entry, read and written whole,
  deleted when cleared, cascading with either end, and attached to the entry
  under the old field name `highlight_group_order`. A hidden personal note
  section would reuse the note router's author rules, but it would be a section
  the registry excludes from every listing, a singleton rule per author, a JSON
  list in a column meant for one row's named fields, and its Sheets travel
  would be by note uuid rather than by the natural key every per-user tab uses.
  The write is under `self.personal_notes`, because the order is part of those
  notes.
- **No per-row `mine` flag on `NoteResponse`.** `GET /api/notes` returns a
  personal section's rows only to their author, so every personal row a viewer
  is served is its own, and the section's `scope` already says who may write
  it. A flag would restate the read rule on every row.
