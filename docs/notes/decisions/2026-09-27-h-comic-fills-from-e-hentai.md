# H-Comic fills from E-Hentai after MAL, mainly for the cover

- **Why E-Hentai.** MAL lists few doujinshi, so most `同人` h-comics had no
  source and no cover, where an E-Hentai gallery usually exists. It runs after
  Tenrai and fill-only like it, so it supplies only what MAL left empty. One
  column, `ehentai_link`, and no id column: the gallery id and token are read
  out of the URL. An `exhentai.org` URL is accepted; the hosts share one id
  space.
- **The official `gdata` API, and no scraping.** `api.e-hentai.org/api.php`
  answers a gallery's metadata with no key and no cookie, and its `thumb` is
  the same cover the gallery page shows; no larger variant exists, so fetching
  the gallery HTML would buy nothing.
- **`posted` and the titles are not mapped.** `posted` is the upload date, not
  the release date, and fill-only would keep that wrong value forever. A
  gallery's titles are an uploader's filename-style string, and an entry's
  names are its identity.
- **`artist:` becomes the illustrator; `group:` is left alone.** The artist
  tags name who drew the work, the `illustrator` credit both regions hold.
  Names are title-cased, written only when the entry has no illustrator, and
  each is checked with `find_person` first, so one ambiguous name skips the
  whole credit rather than crediting half of it. The `group:` tag is the
  circle — the `club` credit, a person with memberships — and is not written.
