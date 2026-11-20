# A casting is the only cast record

- **The cast list has exactly one home.** `character_casting` is the only cast
  record, and an anime's seiyuu list is *derived* by walking its castings. **No
  `media_credit` row with role `seiyuu` ever exists.** Rejected: keeping both,
  which gives one fact two sources of truth that silently disagree.
- **`seiyuu` stays in the one role vocabulary, marked `credited_via`
  `character_casting`.** Rejected: a separate seiyuu role list, which rebuilds
  the two-lists-that-drift problem. Rejected: deriving seiyuu-ness from castings
  alone, which fails the case `PersonRole` exists for — a seiyuu added today
  must appear in the picker before their first casting.
- **A character has no owner and links to many entries.** A nullable
  `franchise_id` was rejected because a character appears in entries that need
  not share a franchise.
- **No `language` column on castings.** It would read "Japanese" on every row
  until a dub is entered; adding it when dubs arrive is additive.
- **Casting is per entry with no default.** Rejected: a NULL entry meaning "her
  usual seiyuu" with overrides — "who voices her here" would have two answers.
  The casting row is the record, so recasts are free.
- **The table is `character_casting`, not `character_appearance`.**
  "Appearance" reads two ways, and with a `photo_file` on the row the wrong
  reading wins.
- **Character names carry no unique constraint**, unlike `person` and
  `studio`. "Yuki" recurs across unrelated works and with no owning franchise
  there is nothing to scope a constraint to. The model comments the divergence
  so nobody "restores" the constraint.
- **So `POST /api/character` is a plain create, not find-or-create.** The same
  rule as people would unify unrelated characters who share a name.
  Disambiguation is in the UI: the combobox lists matches with the entries they
  appear in, and minting a new row is an explicit choice.
- **Deleting a seiyuu never deletes the casting.** A credit *is* the person's
  link to the work, so it cascades; a casting is the *character's* link, so the
  person sits in `character_casting_voice`, whose rows cascade while the
  casting stays.
