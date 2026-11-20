# The structured note shape: one JSONB column for the leftovers

The game guide sections need a dozen different field sets — a variant, a
region, a tier, stat values, and lists nested inside one row. They are served
by a registry-declared field spec plus one JSONB column, `note.fields`.

- **Rejected: a column per field.** `note` is shared by every owner type and
  its column list *is* the Sheets Note tab, so a dozen mostly blank columns
  would ride on every owner's rows to serve games alone, and each later field
  would be another migration.
- **Rejected: a component and a validator per section**, which is a dozen
  near-identical files.
- **Most fields already have a column, and they are mapped first.** A name is
  `title`, a description is `content`, links are `links`, closed dropdowns
  are `kind` and `status`; `fields` carries only the leftovers. Putting
  everything in the blob would have hidden every name and description from
  the sheet, from search and from every existing reader of those columns.
- **Nested lists settle it**: no column can hold one, so a JSONB column was
  arriving whichever way the scalars went. The cost — leftover scalars have no
  database type and nothing to filter on — is accepted because the values
  worth filtering land in the real `status` column.
- **A `select` with no options is free text.** Open vocabularies (a boss
  "type", a tier, a group) are the game's words, not ours, and differ from
  game to game, so they declare no options. Closed vocabularies are facts
  about the player's run and are pinned.
- **A structured section's validation replaces the per-shape rules**, it does
  not extend them, so `kinds` and `statuses` must be empty on one. Two sources
  of truth for one column, only one consulted, reads as working. A test
  asserts the emptiness.
- **A field can declare a default, and a defaulted field never counts as
  filling a row.** A value that is always set would make every untouched draft
  save itself as a row saying nothing. Two registry tests guard it: a default
  must be one of its field's options, and no section may default every field.
- **An order number is free text, and either it or a name is required**
  (`require_any`). Works number themselves "3", "3.2", "II" or "Act I", which
  a numeric column would refuse.
- **NULL means nobody has said.** A new row starts on its default; a row
  written before a field existed is not backfilled, because the default is a
  claim about the player's run that the old row cannot support.
