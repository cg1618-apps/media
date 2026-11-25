# To do next

Last verified: 2026-11-25

**Decided work that is not built yet, in the order it is to be built.** An
item here has been settled with the owner — what to build is known — but
nobody has started it. Unmade decisions and known defects are
[open-items.md](open-items.md) instead.

Like that page, there is **no status column, no claiming and no
lifecycle**. Work starts by cutting a branch, and an item is closed by
deleting it in the same change that builds it; the commit and the pull
request are the record. If the order changes, the list is reordered.

Each item is a short statement and the detail it needs. Where a design
document exists — under `superpowers/specs/` while it is being built — the
item points at it instead, and the present-tense pages take over once it
ships.

## Page and entry-type walkthrough

The owner is going through every page and every entry type, one batch of
changes at a time. **Non-gated types first.** Most changes to a non-gated
type also fit its gated counterpart — Hentai ↔ Anime, H-Comic ↔ Manga,
H-Game ↔ Game — so whenever a change would also make sense on a gated type,
**ask the owner whether to apply it there too** before building it; do not
carry it over silently, and do not leave it out silently.

Standing rule from the walkthrough: **every filter set has a "Clear all"**
that resets every filter in it at once.

### Next batch: entity detail pages

- Person page: naming card moves into the profile card at the top. The
  links (IMDb, MAL, AniList, Twitter, Instagram, pixiv, website) move to the
  left column below My rating, as a Sources-style card, with IMDb above MAL.
  No link buttons beside the credited-entry count.
- Character, person and studio gain an AniList link, entered by hand like
  the MAL link but with no external API.
- Every entity's MAL, AniList and website links show in that left-column
  Sources-style card.
- The 資源 Resources note section is offered on every entity type.
- Entity detail pages: the credited entries / appearance count moves from
  below the title to above it, beside the type text.
- Studio and publisher: the Related companies section moves to the left
  column, below the links card, like Related Entries on a media entry.
- Publisher profile is one row: country, type, active.
- Person credit section titles use the Chinese type labels
  (`PERSON_TYPE_LABELS_ZH` / `personTypeLabel` in
  `components/forms/PersonSubTabBar.jsx`). A person credit card shows the
  media type instead of the release date.
- Studio and publisher credit cards are the library card of each media type
  without the tracker part. Publisher: anime shows airing type, my rating,
  release season, MAL rating; anime movie shows airing type, my rating,
  release date, MAL rating; manga and book show release date, my rating, MAL
  rating; comic shows release year and my rating; game shows release year,
  my rating, Metacritic. Studio: anime, anime movie and game as for
  publisher. Gated types mirror their counterparts. One shared credit sort
  with options release date (default, new to old), release date (old to
  new), my rating, public rating (MAL or Metacritic as fits), using the
  shared sort control with direction (`components/layout/SortControl.jsx`).
