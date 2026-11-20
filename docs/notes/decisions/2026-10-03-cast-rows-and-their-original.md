# Cast rows and their original: what fills which way

A cast row's *original* is the record it casts — the identity it names, else
the character. Rows can be synced from the original, the original from its
rows, and Calculate All runs a fill-only both-ways pass.

- **A blank character role is filled from its castings, fill-only.** Only a
  NULL `character.role` is written, so a role an editor chose is never
  overwritten. The highest-ranked casting role wins (Main, Core, Supporting,
  Other). A character save does not fill, because that would undo a clear the
  moment it was saved; the cost is that a cleared role lasts only until the
  next fill while a casting still names one.
- **Seiyuu live on cast rows only.** A default-seiyuu list on the character was
  offered and declined: a seiyuu belongs to a performance, and a second list
  would be a second answer to "who voices whom". The original's seiyuu are read
  from the same character's other voiced cast rows — the list used most often,
  ties to the oldest row — so a season 2 takes season 1's voices. Rejected:
  "the earliest entry by release date", which needs a date every entry has and
  lets a one-season recast win by age alone.
- **A photo is cleared, not copied.** A cast row with no photo of its own
  already shows the original's, so copying the key would freeze a picture the
  original may later change. The editor shows the fallback read-only
  (`fallback_photo_file`), drawn dimmed and dropped on save.
- **A remark travels one way, from cast row to original.** A cast row's remark
  is about one appearance, so copying the character's remark down said the
  same thing on every entry and filled rows left blank on purpose. The server
  enforces it: `/api/casting/originals` returns no remark.
- **The fill runs originals first, then cast rows**, so it settles in one run.
