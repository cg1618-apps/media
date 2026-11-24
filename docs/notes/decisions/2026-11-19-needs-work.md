# 待補充 Needs Work

Every entry and group can be marked as not complete yet, with an optional note,
and a page lists the marks for the admin and super, a section per common note.

- **One table, `needs_work`, not columns on fifteen tables.** The owner is the
  `note` / `meme` shape: four nullable cascading foreign keys and a CHECK that
  exactly one is set. Columns would have been thirty columns, fifteen reshaped
  sheet tabs and a page querying fifteen tables.
- **The row is the flag.** Clearing deletes it, so "never marked" and
  "cleared" are one state.
- **One mark per owner, by a UNIQUE on each owner column** (NULLs are distinct,
  so the three NULL columns never collide).
- **The note is free text and the grouping key**, stored trimmed with blank as
  NULL, suggested from the `Needs Work Note` common options only. A
  vocabulary that grows from what was typed would feed every typo back.
- **Only a common note is a section of the page; every other note shares one
  Other section, each row showing its note.** A custom note is usually a
  one-off, and a section per distinct note turned the page into a run of
  one-row tables. The unnoted marks keep their own No note section: no note
  is not a custom note, and a row there has nothing to show in a note column.
  The server still groups by exact note and the page folds the groups, since
  the page already reads the common notes for the note field; making the API
  return the page's sections would tie the read to the option category.
- **The permission is `manage.requests`.** `manage.catalog` is locked off for the
  admin, which would then be refused; `manage.requests` is held by exactly super
  and the admin and already means "handle what is wrong or incomplete in the
  data". No new permission.
- **No object check and no narrowing by mode.** The admin resolves the empty
  object set, so a mode-narrowed page would be empty for one of the two roles it
  is for; an owner must exist, not be visible.
- **Set from the Modify editor, saved on its own**: the mark is its own row, and
  folding it into fifteen save paths would tie a one-row write to the entry
  PATCH.
- **The badge is a separate read per detail page**, made only for a holder,
  rather than a permission-dependent field on fifteen response schemas.
- **The marks travel on the Sheets backup**: unlike requests, they are the
  catalogue editor's bookkeeping and move with the catalogue they describe.
