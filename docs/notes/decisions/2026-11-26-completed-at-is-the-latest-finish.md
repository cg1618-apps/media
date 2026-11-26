# completed_at is the latest finish, not the first

A list row's `completed_at` is stamped whenever the row moves into a
completed status from one that is not. A write that leaves an
already-completed row completed keeps the stamp it has.

## Why

The Completions page lists completions newest first by `completed_at`. Under
the earlier rule, a stamp was written once and never overwritten. So an entry
finished, moved back to Watching or Plan to Watch, and finished again kept
its first date. Mark completed then looked like it had not worked: the
status changed and the button hid, but the entry sorted months down the
list, past the rows a tab shows. The local database held such rows. One was
a movie in Passive Watching still stamped with a finish from six months
before.

What the page is asked to show is what was finished recently. A rewatch or
a reread that ends today is a finish today.

## Rejected

- **Clear `completed_at` when a row leaves a completed status.** This also
  makes the next finish stamp fresh. But it throws away the date the moment a
  status is mis-clicked, and a Pull of an old backup would still bring back
  rows that hold both a stale stamp and an unfinished status.
- **Keep the first stamp, and sort Completions by `updated_at`.**
  `updated_at` moves on every edit, such as a rating change or a note, so the
  page would stop meaning "finished".
- **Re-stamp on every write that names a completed status.** A form save of
  an entry that is already Completed would move its finish date to today. The
  transition check exists to prevent exactly that.
