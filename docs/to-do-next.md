# To do next

Last verified: 2026-11-17

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

## 1. Upcoming books and manga volumes on Future Releases

**Each book unit gets a JP and a TW release date, manga gets the next
volume's JP and TW release dates, and Future Releases shows both.**

- **Book units** (`book_unit`, the Units section,
  `BookUnitsEditor.jsx`) gain `release_date_jp`,
  `release_date_tw` and a cover image. The dates use the same partial-ISO
  format, are nullable, and are allowed on every unit kind. **There is no
  per-unit release status**: a unit is upcoming when one of its dates is in
  the future, and nothing more is recorded. The Units section stays the
  place these rows are entered.
- **Manga** gains `next_vol_release_date_jp` and `next_vol_release_date_tw`,
  in the same format and edited by hand. Its detail page shows them. Manga
  does **not** get the unit table.
- **Future Releases** (`pages/public/FutureReleases.jsx`), which today reads
  anime, the films, TV shows, cartoons and games, gains:
  - **Books**: a book entry whose own JP or TW release date is in the future,
    and a book *unit* whose JP or TW date is in the future. A unit appears
    under its book, by the unit's name.
  - **Manga**: a manga whose next-volume JP or TW date is in the future.

  A date that has passed simply drops off the page. The detail page still
  shows it until it is edited.
- Data entry is by hand. Automatic sources are being researched; see
  open-items.md, "Automatic book release data".
