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

## 1. Novel becomes Book

**The Novel type is renamed Book throughout, not just in the UI**: table
`novel` → `book`, `media_type` `'novel'` → `'book'`, route `/api/novel` →
`/api/book`, registry and SPA keys, the `Novel` franchise type → `Book`, and
the sheet tabs `Novel` / `Novel Unit` / `User Novel Unit Rating` → `Book` /
`Book Unit` / `User Book Unit Rating`, along with `novel_unit` and
`user_novel_unit_rating`, their columns (`novel_id` → `book_id`) and the
`novel_name_*` columns. Pull accepts a sheet written before the rename and
maps the old tab and column names onto the new ones. About 280 files mention
`novel`, so grep for it rather than trusting a list. Prose in docs that
means the *genre* (a light novel, a web novel) stays.

- **The type vocabulary becomes Chinese**: `輕小說` (Light Novel), `小說`
  (Novel), `網路小說` (Web), `短篇集`, `指南/設定集`, `其他`. The migration
  maps the existing values one-to-one (`Light Novel` → `輕小說`, `Novel` →
  `小說`, `Web` → `網路小說`, `Other` → `其他`). **The owner moves entries
  that belong under `短篇集` or `指南/設定集` by hand**, after the migration.
- **Statistics keeps a Novel section, and it counts novels only**: books of
  type `輕小說`, `小說`, `網路小說` and `短篇集`. `指南/設定集`, `其他` and
  an unset type are left out of it.
- **A book's release date splits into JP and TW**, as anime's does:
  `release_date` → `release_date_jp`, plus a new `release_date_tw`, both in
  the existing partial-ISO format (`YYYY`, `YYYY-MM`, `YYYY-MM-DD`).
  `end_date` stays one column.
- *Gravity Falls: Lost Legends* is a graphic novel and goes under Comic. The
  owner moves it by hand; nothing in code depends on it.

It comes after the remark rework and the progress floats, which both touch
the novel code: a rename running alongside them would conflict everywhere.

## 2. Upcoming books and manga volumes on Future Releases

**Each book unit gets a JP and a TW release date, manga gets the next
volume's JP and TW release dates, and Future Releases shows both.**

- **Book units** (`book_unit`, the Units section,
  `NovelUnitsEditor.jsx` before the Book rename) gain `release_date_jp`,
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
