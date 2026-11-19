# Clean orphaned data: the sheet may be ahead, and any identity hit spares a row

- **The sheet is allowed to be ahead of the database, and there is no
  freshness gate.** The obvious rule — "back up first, so the sheet reflects
  local truth" — is backwards here: in the workflow that creates the garbage,
  the sheet is *deliberately* ahead, because the machine that performed the
  deletion wrote it. A Backup first would write the local garbage into the
  sheet and destroy the only evidence the diff has.
- The cost is that a row created locally since the last Backup looks
  identical to an orphan. It is handled in the review UI rather than by
  refusing to run: the report carries the last Backup time and each
  candidate's `created_at`, and post-Backup rows are marked and left out of
  select-all.
- **Tiers and entries only.** Deleting a vocabulary value or a person does not
  remove a row the user reviewed — it silently rewrites every entry citing it
  through `ON DELETE CASCADE`. An orphaned option is clutter; an orphaned
  entry is divergence, and only the second is reviewable one row at a time.
  Authorization tabs are excluded too: a delete path into `Users` would let a
  sheet edit remove an account.
- **A candidate must miss on EVERY identity the sheet carries; any single hit
  spares it.** `(media_type, public_id)` is the load-bearing one, and it is
  stronger than a name match — Backup writes `public_id` and Pull restores it
  unchanged — so a rename on one machine does not make an entry look orphaned.
- **The asymmetry is deliberate:** a false negative keeps one piece of garbage
  for one more round; a false positive deletes a real entry and everything
  cascading from it.
- **An identity rule borrowed from an upsert path must be re-derived before it
  gates a delete.** Pull's id-less matching rule is sound for upsert and would
  have destroyed data here — an entry renamed on the other machine misses on
  every name. The failure directions of upsert and delete are opposite.
- **Prefixes are read, not guessed.** Column prefixes are not uniform
  (`tv_name_en`, not `tv_show_name_en`), which is a second reason entries are
  matched on the `Media` tab rather than on their detail tabs.
