# Some values on a catalogue note row are each account's own: note marks

On some catalogue sections the row — the item, the enemy, the song, the mod —
is shared, while values like collected, beaten, completion, my value and the
music and mod status are each reader's own. The registry marks them
(`NoteField.personal`, `NoteSection.personal_status`).

- **One JSONB mark per account per row**, `note_mark (user_id, note_id,
  values)`, the `game_choice_mark` shape. A row per value adds a key column the
  registry already names; a typed column per value would be a migration for
  every personal field, which the registry exists to avoid. The values are a
  few short strings, queried across rows only by the review queue's one status
  filter.
- **Overlaid in place, not a parallel structure.** Each `NoteResponse` puts the
  viewer's value where the field lives (`status`, or `fields[key]`), so the
  page, its quick edit and its status bars read one place. A catalogue write
  drops those keys, so a stale value on a row can never leak.
- **An unmarked value reads its declared default, else null.** Storing a
  default would make every unmarked account look like it had answered.
- **A catalogue write ignores a personal key rather than refusing it.** The page
  sends a row back whole, drawn with the viewer's values; refusing them would
  fail every edit.
- **Per-account switches gate the music and mod statuses** through
  `has_feature`.
- **The review queue reads the caller's own music statuses**: "waiting on
  something" is a fact about one person's tracking.
- **The NG reset is registry-driven** (`NoteField.ng_resets`) and clears the
  caller's own marks only.
- **Sheets: a Note Mark tab by `username` and the note's uuid**, translated
  through the Note tab when this database holds the row under its own uuid.
