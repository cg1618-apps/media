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

## 1. Clear every Comic's remarks

**A one-off migration deletes every `備註 Remark` and `備註列表 Remark List`
note row owned by a Comic entry**, shared and personal alike, for every
account. Nothing is preserved and no dump is kept for it. Scope is the Comic
type only: not H-Comic, and not the collection, franchise or series a comic
sits in. Comics keep both sections afterwards; only the data goes.

It comes before item 2 so that the remark migration has no comic rows to
carry, and none to list in item 2's report.

## 2. 備註 becomes a shared list; 備註列表 becomes 個人筆記 Personal Notes

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

## 3. Anime: Original or Remake

**Anime gets a new field saying whether the entry is the original work or a
remake: `Original` (the default) or `Remake`.** It is modelled on game's
`is_main` (`GAME_IS_MAIN` in `app/utils/constants.py`), but it is a new
column of its own, because anime's `is_main` already means
本傳/外傳/前傳/後傳/總集篇. Anime only: not Anime Movie or any other type.
Existing rows are set to `Original`. It is on the anime form, the detail
page and the Anime sheet tab.

## 4. `ep_special` is text

**Anime's `ep_special` becomes a string**, because specials are numbered like
`17.5A` and `17.5B`. Today it is a `Float` (`app/models/anime.py`), entered
as a number (`AnimeAddTab.jsx`, `parseFloat` in `lib/payloads.js`).
Existing values convert without a trailing `.0`: `17.0` → `"17"`, `17.5`
→ `"17.5"`. Watch orders read it too (`WatchOrderEditor.jsx`,
`WatchOrderGuide.jsx`). Check every reader that sorts or does arithmetic on
it.

## 5. Every progress number is a float, and +/− steps to the next integer

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

## 6. Pull shows its progress

**Pull All and single-tab Pull stream their progress to the page, the way
Backup does.** Backup already runs on its own worker and relays SSE
(`POST /api/data-control/backup` in `app/routers/data_control.py`). Pull
(`/pull`, `/pull/{key}`, `/pull/{tab_name}`) is one blocking request behind
a spinner (`pages/admin/Admin.jsx`). Pull gets the same shape: per-tab
progress events, keepalives inside the tunnel's ~100 s window, and a 409
while a Pull is already running.

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
