# Studio names are four columns, and the display name is chosen per row

- **Four plain nullable name columns** — `name_en`, `name_cn`, `name_jp`,
  `name_alt` — with a CHECK that at least one is set. It is the shape the media
  tables already use.
- **Rejected: a stored `name_native` kept as a cache of the display name.** The
  migration and Fill/Pull write around the API, so the cache would go stale
  exactly where it matters.
- **Rejected: a `studio_name` alias table.** The most honest model, but it
  diverges from every other name-bearing table and complicates every form, for
  four fields.
- **`country` is a plain string column.** A studio is not a media entry, so the
  option-link tables keyed on entries would need a new link table; a plain
  column can be promoted later without breaking readers.
- **The display name is chosen per row:** `display_name_field` holds
  `en | cn | jp | alt` or NULL, resolving to the chosen field, then
  `en → cn → jp → alt`, then `""`. People follow the same rule.
