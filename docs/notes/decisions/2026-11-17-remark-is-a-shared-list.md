# 備註 Remark is a shared list; 個人筆記 Personal Notes is each account's own

- **備註 Remark is the catalogue's**: catalogue-scope rows on every owner,
  written under `manage.catalog` and read by everyone who can see the owner. A
  per-author remark left the catalogue with no shared prose on an entry and gave
  each member a second personal place to write. A member's own notes are
  個人筆記 Personal Notes (`personal_notes`).
- **It is a list, not a singleton.** One block of prose per owner turned into
  walls of unrelated points; a list lets each point be its own row with the
  links it rests on.
- **Personal remarks were never published.** Existing per-author remarks became
  their authors' personal notes in place. Rejected: publishing them as the
  catalogue remark — they were written as private assessments — and
  re-authoring them to one account: a remark is never handed to an account that
  did not write it.
- **Splitting a remark on line breaks was rejected**: a remark's lines are
  sometimes one point wrapped by hand and sometimes several points, and nothing
  in the text says which. Multi-line remarks are reported for splitting by hand
  (`multiline_remarks`).
- **No virtual `remark` attribute.** With several rows there is no single string
  to map, and two editors of one row (a form textarea and the Notes card) were a
  last-write-wins hazard; remarks are written in the Notes card only, and a
  `remark` key sent to an entry route is ignored.
- **A downgrade folds rather than refuses or moves.** Moving extra rows into
  personal notes would turn shared catalogue text into one account's private
  notes.
