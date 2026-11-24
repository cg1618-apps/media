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

No batch is queued; the next one comes from the owner.
