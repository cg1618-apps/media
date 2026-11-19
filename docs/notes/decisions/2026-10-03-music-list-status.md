# Music: a status per song list, and OST as a song list

- **Every song list of an anime carries a status of its own** ("All Done",
  "Done", "Need", "Pending", "Not Done"), beside the per-song status. Two
  levels because they answer different questions: "All Done" is a claim about
  the list that no one song can make.
- **The list status is a `music_status` note row keyed by `kind`**, one per
  `(anime, list)`, rather than columns on `anime`. Rows keep the status beside
  the songs it describes — the same table, Note tab, notes API and card — and a
  further list is a registry entry, not a migration. The registry marks it
  `hidden` and each list points at it with `type_status_section`, so
  `/sections` alone tells the page where the bar goes. `one_per_kind`
  generalises `singleton` to one row per owner and kind; the router, Pull and a
  partial unique index all read it.
- **Seeded on create.** An anime created through the API gets its status rows
  inside the create transaction, through the spec's `create_hook` —
  `pre_commit_hook` also runs on update, and what an entry starts with is
  written once.
- **OST is a song list like the others**, not a singleton: with its status in
  `music_status`, nothing needed the singleton.
- **One song shape**, `music_track`, on all four lists, with an optional
  episode. Song Type stays on OP and ED alone.
- **Song Type is an open vocabulary.** Any text is accepted and the "Song Type"
  option category only suggests (`kind_category`); a new cut is an option an
  editor adds, not a deploy.
