# Entities keep 資源 Resources, and an AniList link column

A studio, publisher, person, character or identity owns the 資源 Resources
note section beside 備註 Remark and 個人筆記 Personal Notes, and a studio,
person or character carries an `anilist_link` column beside `mal_link`.

- **Resources is about the thing, not about a work.** The review and analysis
  sections stay off entities because they judge a work and an entity is not
  one. Resources is a list of somebody else's material - a wiki page, an
  interview, a fan site - and a seiyuu or a studio has those as much as a
  series does. It joins by widening the section's `owners` to
  `ALL_OWNERS + ENTITY_OWNERS`, the way the remark pair did: one registry
  edit, no migration, and the page draws it as the standalone card it is on
  every entry.
- **The AniList link is a column, not a source row.** An entry keeps its
  displayed-only links as `media_source` rows
  ([2026-09-04-link-column-or-source-row.md](2026-09-04-link-column-or-source-row.md)),
  but an entity has no source rows: its own pages are columns
  (`person.twitter_link`, `ig_link`, `pixiv_link`), so the AniList link
  follows them.
- **No `anilist_id`.** `mal_id` exists because something acts on it - the MAL
  fills and the cast import key on it. Nothing calls AniList for an entity, so
  an id would be derived and then never read; the link is stored as typed.
- **A Pull of a sheet without the column leaves the link alone**, as the
  character firsts do: a backup taken before the column existed would
  otherwise clear every link on the next Pull.

Rejected:

- **Resources as an entity-only section.** A second key for the same list
  would split one vocabulary in two, and the frontend would need to know the
  difference.
- **Deriving an `anilist_id` "for later".** A column nothing reads is a column
  that drifts from its link unnoticed.
