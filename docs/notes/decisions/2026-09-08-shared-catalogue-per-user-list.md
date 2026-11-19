# The catalogue is shared; the list is per user

- **One catalogue row per work, with per-user rows beside it.** A `media`
  supertable holds one row per entry across every type, carrying identity plus
  the shared catalogue fields (`display_name`, `cover_image_file`,
  `franchise_id`, `series_id`, `public_id`, timestamps). Detail tables keep
  every type-specific column, and their primary key is a foreign key to
  `media`.
- **One `user_media_list` table** with a real foreign key holds the superset
  of progress columns. It is wide and null-heavy, and that is accepted rather
  than relitigated.
- **Grouping tiers and watch orders are shared and curated**, one canonical
  order per series. Quotes and memes are catalogue rows; whether a viewer
  favourites one is that viewer's own.
- **Catalogue writes are editors' writes.** There are no user-contributed
  entries, no moderation queue, no edit history and no social features.
- **Notes are scoped per section in the registry** — catalogue or personal —
  rather than per note or per user.

Sharp edges that come with the supertable, and the guards on them:

- **Deleting from a detail table orphans the `media` row.** The cascade runs
  only when deleting from `media`; `DELETE FROM anime` leaves the parent
  behind and no constraint catches it. An `AFTER DELETE` trigger per detail
  table, plus a test, closes it.
- **Each detail table carries a composite `(system_id, media_type)` foreign key
  and a `CHECK (media_type = '…')`, and Alembic's autogenerate writes neither.**
  A new media type has to get them right by hand; a drift test checks them.
- **`display_name` can go stale**, the one bug class the supertable adds.
- **`media` attracts fields it should not have.** The promotion rule in
  `app/models/media.py` is the guard: a column moves up only when every type
  could carry it *and* something queries across types by it.
- **`media_resolver.py` does not dissolve.** `TIER_TABLES` still renders "this
  note belongs to franchise X"; what ended is `(media_type, entry_id)` as a
  storage pattern for entries, not as a concept.
