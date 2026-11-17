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

## 1. 備註 becomes a shared list; 備註列表 becomes 個人筆記 Personal Notes

**The shared `備註 Remark` stops being one block of prose per owner and
becomes a list, and the personal `備註列表 Remark List` is renamed
`個人筆記 Personal Notes`.** Both keep every owner (every type, every
group). Today's definitions are the first two entries of `NOTE_SECTIONS` in
`app/utils/note_sections.py`.

- **`備註` (key `remark`)** keeps its label and its catalogue scope, and
  takes the list shape `備註列表` has today (`SHAPE_TEXT_LINKS`, not a
  singleton). The partial unique index `ix_note_one_remark_per_owner` is
  dropped.
- **Migration: each existing remark becomes one list row, text unchanged,
  line breaks kept.** Nothing is split automatically. **Every remark whose
  text runs to more than one line is listed in an artifact for the owner**:
  owner type, entry or group name, and the full text. The owner splits those
  by hand. Produce it when the migration is run.
- **`備註列表` → `個人筆記 Personal Notes`**: key `remark_list` →
  `personal_notes`, label, and the rows' `section` value in the migration.
  Still personal, still a list. A Pull of a sheet written before this
  carries `remark_list` rows, so Pull maps the old key onto the new one.
- **The Remark textarea leaves every add and edit form.** The shared "Cover
  & Remark" section (`components/forms/CoverRemarkFields.jsx`) becomes
  "Cover" only, so its misleading "Private notes..." placeholder goes with
  it. Remarks are written in the Notes card, like every other list section.
- **The virtual `remark` attribute goes with the singleton.** That means
  `attach_remark` / `upsert_remark` / `pop_remark`
  (`app/services/domain/remark_field.py`), the `remark` field on entry and
  group create/update/response schemas and form payloads, and every place
  that reads it. Grep for them rather than trusting this list.
- **The admin Remarks review** (`GET /api/data-control/check/remarks`,
  `find_all_remarks` in `app/services/domain/remarks.py`,
  `components/review/RemarksView.jsx`) keeps its job: it lists entries that
  have shared `備註` rows, now possibly several each.
- `docs/catalogue.md`, `docs/data-model.md` (`remark` virtual and the
  `note` indexes), `docs/systems/notes.md` and `docs/api.md` are updated in
  the same change.

## 2. Anime: Original or Remake

**Anime gets a new field saying whether the entry is the original work or a
remake: `Original` (the default) or `Remake`.** It is modelled on game's
`is_main` (`GAME_IS_MAIN` in `app/utils/constants.py`), but it is a new
column of its own, because anime's `is_main` already means
本傳/外傳/前傳/後傳/總集篇. Anime only: not Anime Movie or any other type.
Existing rows are set to `Original`. It is on the anime form, the detail
page and the Anime sheet tab.

## 3. `ep_special` is text

**Anime's `ep_special` becomes a string**, because specials are numbered like
`17.5A` and `17.5B`. Today it is a `Float` (`app/models/anime.py`), entered
as a number (`AnimeAddTab.jsx`, `parseFloat` in `lib/payloads.js`).
Existing values convert without a trailing `.0`: `17.0` → `"17"`, `17.5`
→ `"17.5"`. Watch orders read it too (`WatchOrderEditor.jsx`,
`WatchOrderGuide.jsx`). Check every reader that sorts or does arithmetic on
it.

## 4. Every progress number is a float, and +/− steps to the next integer

**Every progress count and total becomes a float**: `ep_fin`, `ep_total`,
`ep_previous`, `issue_fin`, `issue_total`, `page_fin`, `page_total`, and
manga's and H-Comic's `ch_total` and manga's `vol_total`, on top of the ones
that are float already (`vol_fin`, `ch_fin`, `arc_fin`, `ch_fin_in_arc`,
novel's totals). Not `achievements_total`, and not `vol_fin_page`.

**The tracker's + and − go to the nearest integer in that direction**:
`1.2` + → `2`, `1.2` − → `1`, `2.5` + → `3`, `2.5` − → `2`. An integer
steps by one, as now (`2` + → `3`). The rule holds for every progress
counter, including manga's and novel's, which are already floats. Whole
values display without `.0`.

## 5. Novel becomes Book

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

It comes after every item above it because the remark rework and the
float change touch the novel code, and a rename running alongside them
would conflict everywhere.

## 6. Upcoming books and manga volumes on Future Releases

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

## 7. A content label chip says who sees it

**The chip a detail page draws for each content label gets a tooltip that
says which modes show the label and which label it also carries, generated
from the rule in code, never written as prose.** Today the chip's tooltip
is the label's description (`components/info/ContentLabelChips.jsx`), or
for a group the note saying what it covers.

- **The rule is the one the label reference already draws.**
  `/content-labels` (`pages/admin/ContentLabels.jsx`) shows "Shown in" and
  "Also carries" from `lowest_mode`, `modes` and the required labels on
  `ContentLabelResponse` (`app/schemas/rbac.py`), all derived from
  `app/services/rbac/labels.py` and `seed_modes.MODE_ORDER`. The chip says
  the same thing in the same words.
- **The description stays what it is: what the label marks, in Chinese**,
  and nothing about who sees it. Generating the "who" from the rule is what
  keeps it from drifting when a label's lowest mode changes.
- **What it needs on the server.** A detail page's labels arrive as
  `ContentLabelRef` (`key`, `label`, `description`), which is kept narrow so
  that widening the admin payload does not widen every public entry
  response. The tooltip needs the modes and the required labels on that
  ref, or a lookup by key that every viewer may read: `GET
  /api/content-labels/` is the reference's and answers only `admin.authz`
  or `manage.catalog`.
