# A book's volumes and arcs are one table with a kind

- **One `book_unit` table with a kind discriminator**, not separate volume and
  arc tables. "Other" spans volume, story and chapter, so separate tables would
  mean three tabs, three editors and per-type branching in every layer.
- **Rejected: structured JSONB on the book row.** It keeps a single-row Sheets
  round trip, but Postgres enforces nothing inside it, every edit rewrites the
  whole array so two concurrent edits to different volumes lose one silently,
  and adding a field means a hand-written document rewrite rather than a
  migration.
- **Unit rows are optional for volumes and authoritative for arcs**, and the
  asymmetry is deliberate. Listing volumes is enrichment, so the denominator
  stays `vol_total_original` / `vol_total_tw` and `vol_fin` may exceed the
  number of volume rows. An arc row carries `ch_count`, which lives nowhere
  else, so when arc rows exist `arc_total` and `ch_total` derive from them;
  with none, a web novel falls back to the flat `ch_fin` / `ch_total` pair.
- **The reading cursor lives on the list row, not on the units.** `arc_fin`
  counts *fully finished* arcs, so the arc being read is `arc_fin + 1` and
  `ch_fin_in_arc` is the position within it. Rollover is normalised server-side
  on write, so the Sheets restore path gets the same guarantee as the UI.
  Rejected: a `finished` flag or per-unit `ch_fin`, which would express
  non-linear reading that does not happen.
- **Carry stops at the last recorded arc.** If `arc_fin` equals the arc count,
  `ch_fin_in_arc` is left as it stands rather than clamped — an ongoing web
  novel is read into an arc nobody has recorded yet, and clamping would discard
  that progress silently.
- **Derived totals stay stored columns**, recomputed on every write, because the
  completion rules, dashboard cards and the Plan page already read them.
- **A unit's name is a key plus a title per language** (`unit_key`, `name_cn`,
  `name_en`), all optional. One row holding both languages rules out the drift
  two positional lists had; an empty `unit_key` renders a generated one.
- **`vol_total_original` is relabelled, never renamed.** Renaming it would move
  a Sheets header, and headers are the restore contract.
