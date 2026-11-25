# An entity's remarks are notes

A studio, publisher, person, character or identity keeps its 備註 remarks as
rows of the notes `remark` section, not in a `remark` column of its own.

- **One list shape and one editor everywhere.** Entries and the three tiers
  already held their remarks as `remark` note rows; an entity's single
  free-text column was the one place a remark looked and behaved differently.
  As notes, an entity gets what the list gives every other owner: several
  remarks, each its own row with the links it rests on, ordered and edited in
  the same Notes card, and 個人筆記 Personal Notes beside them for each
  viewer's own.
- **Not the review and analysis sections.** They are about a work, and an
  entity is not one. Which sections an entity does own is the registry's
  (`ENTITY_OWNERS` in `app/utils/note_sections.py`); see
  [2026-11-25-entities-keep-resources.md](2026-11-25-entities-keep-resources.md)
  for why 資源 Resources is one of them.
- **The column is dropped, not kept beside the list.** Two places to say one
  thing drift apart, and every reader - the page, the sheet, the cast sync,
  merge - would have to know which one wins. The migration moved each non-blank
  column into the first Remark row, and a sheet that still carries the old
  header is converted on Pull, so nothing written in it is lost.
- **Five foreign-key columns, not a polymorphic owner.** `note` already holds
  one nullable FK per owner kind and `ck_note_one_owner` requiring exactly one
  ([systems/notes.md](../../systems/notes.md)), so every owner cascades and a
  deleted entity takes its notes with it. An `(owner_type, owner_id)` pair
  cannot cascade, and orphan rows are exactly what the existing design was
  built to avoid; the entities follow it rather than open a second shape.
- **A cast row's remark is added, not copied over.** With a list, Sync from
  cast can keep what the original already says and append the row's remark
  once, instead of replacing one value with another.

Rejected:

- **Keep the column and mirror it into a note row.** Two sources of truth, and
  a sync rule for every write path.
- **A separate `entity_note` table.** A second notes table would need its own
  API, registry, sheet tab and editor for the same sections.
- **A generic owner pair on `note` for the entities only.** Mixed storage, with
  entity notes surviving their entity as orphans.
- **Downgrade preserving everything.** The downgrade joins each entity's
  Remark rows with newlines into the column and drops every entity-owned note;
  personal notes on an entity have no column to go back to, and that loss is
  accepted rather than designed around.
