# Books fill from Open Library through an anchor book

- **The stored id is an anchor book, not the entry.** One entry may cover
  several books and no books API has an identifier for "the trilogy as one
  thing", so the work id names book 1. Fill writes only what is true of the
  whole entry when read off the anchor — release date, cover, the author
  credit — and **refuses** what the anchor cannot know: end date, volume total,
  serialization status.
- **Rejected: searching by title and merging the results.** Fuzzy matching
  across editions, box sets, audiobooks and reprints picks the wrong record
  silently, and Open Library's title search proved unreliable even when the
  book exists.
- **Open Library over Google Books.** Google wins on publisher and page count,
  neither of which is written here; it needs an API key whose keyless quota was
  already exhausted from this IP, and its volume ids are edition-specific where
  Open Library work ids survive reprints.
- **The date comes from the earliest edition.** `work.first_publish_date` was
  unpopulated on every work checked, and the earliest edition's year beat
  `search.first_publish_year` and never lost. Year precision is fine: release
  dates already accept a bare year.
- **Fetch only what is missing** (one to three calls driven by flags), because
  `editions.json?limit=1000` is large and Fill is fill-only, so an entry that
  already has a date can never use it.
- **`covers` uses `-1` as a "no cover" sentinel**, so it must be filtered.
- **MAL wins when both ids are present.** Tenrai returns strictly more, so Open
  Library fills only where there is no MAL link, keeping the book fill path a
  routing choice rather than a merge.
- **Per-volume ids were deferred, not ruled out.** A book id on each
  `book_unit` row is the correct model but costs a column, N calls per entry
  and a fill path for child rows, for the minority entry shape. The two are
  additive: the anchor stays the entry-level date and cover source.
