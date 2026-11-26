# To do next

Last verified: 2026-11-26

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

## Split `docs/frontend/pages.md`

`docs/frontend/pages.md` is split into one page per area under
`docs/frontend/pages/`, as a pure move — sections are moved, not reworded,
so the diff reads as moved lines. Do it when no open branch edits
`pages.md`, since every one of them would otherwise conflict.

| File | Sections |
| --- | --- |
| `dashboard.md` | Index |
| `search.md` | Search |
| `libraries.md` | Library (media), CollectionLibrary, FranchiseLibrary, SeriesLibrary, StudioLibrary, PublisherLibrary, PersonLibrary, CharacterLibrary |
| `entity-detail.md` | Entity detail pages, Person, Character, Identity, Publisher, Studio |
| `entry-detail.md` | Detail pages (the twelve media types) |
| `hubs-and-orders.md` | Hubs, OrderPage |
| `plan.md` | Plan, FutureReleases |
| `seasonal.md` | SeasonalOverall, SeasonalDetail |
| `statistics.md` | Statistics, Completions |
| `random-picker.md` | RandomPicker |
| `other-pages.md` | Quotes and Memes, Resources, MyRequests, Login, ResetPassword, Settings, UnderDevelopment, Pages in two versions |

`pages.md` keeps the route map, the guest scope, the navigation model, the
shared page plumbing and the known rough edges, and links to each file.
Every `pages.md#…` link elsewhere in `docs/`, `docs/README.md` and the
documentation map in `CLAUDE.md` are repointed in the same change.
