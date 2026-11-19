# A cast is imported into the form, from a sibling or from MyAnimeList

The cast editor can copy another entry's cast in, or turn an entry's MAL
character list into cast rows (`POST /api/casting/mal`).

- **The import fills the form, not the database.** It appends rows the way
  typing does and the editor's ordinary save writes them, so an import can be
  reviewed and trimmed first and there is no second write path into
  `character_casting`. A character already in the cast is skipped. A MAL import
  commits only the characters and people it had to create, as the editor's own
  comboboxes do.
- **Siblings are the franchise's entries, of any castable type**, keyed on the
  franchise rather than an entry, so the Add form can use it before the entry
  exists. Everything is copied, photo and remark included: a value that no
  longer fits is edited after, one that still fits is not retyped.
- **A MAL character is matched by `mal_id`, never by name, database-wide.**
  "Yuki" recurs across unrelated works. Only characters the caller can see are
  matched, so a hidden record's name never lands in their form.
- **Within the cast being edited, a name match is allowed.** A character
  already in this entry's cast has been placed in this work by the editor, so
  MAL listing the same name for the same work is the same character. The
  editor sends the ids it holds; a MAL row no `mal_id` matches is compared by
  name — in either name order, through `normalize_name` against every name
  column — with those of them that have no `mal_id`. One match is reused; more
  than one is a warning and nothing is created. A held character with a
  `mal_id` is never matched by name.
- **A seiyuu is matched by `mal_id`, then by name**, through `resolve_person`:
  a human's full name is nearly unique, and a seiyuu entered without a MAL link
  would otherwise be split across two rows. A name-matched person takes MAL's
  id, so the next import matches by id. An ambiguous name is a warning.
- **Japanese voices only.** MAL lists every dub; a casting records the original
  cast.
- **A new character's portrait downloads after the response.** Inline downloads
  made a long cast take minutes. The row's `photo_file` is set to the key the
  background download will write; a failed download leaves a missing own file,
  which the next MAL fill already repairs.
