# To do next

Last verified: 2026-11-24

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

### Batch 1 — collection, franchise and series

Gated answer for this batch: everything below that names Anime, Manga or
Game applies to Hentai, H-Comic and H-Game in the same way, and the gated
types keep their place after Game in the library type filters.

- **Collection library card**: swap the positions of the franchise count and
  the expectation.
- **Collection detail**: the eyebrow above the title is just "Collection";
  no franchise count above or below the title; no expectation label.
  Belonging franchises sort by Title (default), My Rating, Expectation, and
  lose the line "Franchises grouped under this collection". The Order tab
  loses "Cross-franchise orders covering this collection".
- **Franchise library**: a Game chip in the type filter; a progress filter
  with "Any completed" (some belonging entry is Completed) and "Any started"
  (some belonging entry is neither not-started nor Won't).
- **Franchise detail**: hide the collection / series count when it is none;
  "To rewatch/reread/replay" reads "To Redo" (franchise only).
- **Series library**: an "Other" type chip as the franchise library has;
  Comic sits between Cartoon and Game.
- **Series detail**: the Relations tab gets "Edit relations" like the
  franchise hub, which needs a series lens on the admin `/relations` page.
  Relations stay entry-to-entry, so one fact shows on all three tiers.
- **Franchise and series detail, belonging tabs**:
  - no completion percentage above the name; no 動畫瘋-only toggle;
  - every media tab has a Completed filter (yes / no / all, default all) in
    place of its watching-status pills — except Game, which filters by
    completion level instead: Main Story, Main + Extras, Completionist, then
    Post-game, plus "Not completed" for a null level;
  - Anime: airing type filter only (plus Completed);
  - Manga: default sort release date; no region tag on the card;
  - Book: a 小說 filter (yes = 輕小說, 小說 or 網路小說; no = anything else;
    all, default) replaces the serialization pills; no region tag on the card;
  - Anime Movie and Movie cards: rating where the anime card has it (MAL for
    anime movie, IMDb for movie), runtime under the release date; anime movie
    shows the JP date first, movie the TW date first; no release-status
    filter;
  - TV Show card: region top-left, score right of the release date, no
    airing status; TV and Cartoon lose the airing-status filter;
  - Game: sort by release date (default), title, my rating, Metacritic,
    Metacritic user; card shows release date above play hours, Metacritic
    and Metacritic user stacked on the right, game type top-left on the
    cover; a game type filter;
  - Characters: a kind filter (Character, Identity; Character on by default)
    and a gender filter (男, 女, 其他; none on = all), multi-select chips with
    no "All" chip; sort by name (default) or my rating, within each group.
