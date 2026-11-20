# Novel became Book, throughout

- **Renamed everywhere, not just in the UI.** The type holds short-story
  collections, guides and setting books as well as novels. A label-only rename
  was rejected: the table, key, route, permission, franchise type and sheet tabs
  would all have said `novel` under a page saying Book. Every named database
  object was renamed too, so the result is exactly what `create_all` builds.
- **The `type` vocabulary is Chinese** (`輕小說`, `小說`, `網路小說`, `短篇集`,
  `指南/設定集`, `其他`); which existing entries belong to the new values is not
  derivable, so they are moved by hand.
- **Statistics keeps a section called Novel, counting novels only**
  (`NOVEL_BOOK_TYPES`): a guide is a book, not a novel, and would skew a novel
  rating distribution.
- **The old release date became `release_date_jp` only.** It stood for the
  original's first publication — MAL and Open Library know only the original —
  so copying it into TW would invent a Taiwanese edition date.
- **Pull reads a sheet written before a rename through
  `app/services/pipelines/legacy_names.py`**: old tab titles, old column names
  and old cell values. The current tab title wins whenever it holds a row; an
  old title is read only when the sheet lists it, because asking Sheets for a
  title it lacks creates the tab.
- **Old URLs redirect**, swapping only the type segment, with `replace`, so
  bookmarks and links in notes keep working.
- **Cover folders are copied at startup, not moved.** After a rollback the old
  code looks under the old folder; a move would leave it empty.
- **Storage keys and history are not rewritten**: the favourite grid's
  `type_slots` key, `deleted_record` tombstones, hentai's `Novel` source
  material (a genre, not this type) and historical revisions.
