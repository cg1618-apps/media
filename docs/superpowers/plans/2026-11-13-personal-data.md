# P5, the personal data — plan

Builds "Catalogue and user data" of
`docs/superpowers/specs/2026-11-03-account-system-design.md` (lines 367-509)
and the personal half of `2026-11-12-notes-rework-design.md`. Who sees what
is `docs/viewers.md`, which is the authority.

Worktree `media_personal_data`, branch `feat/personal-data` off `dev`
`495df3e`, database `media_personal_data`. **One branch for the whole of
P5**, built through without waiting between parts, with a **draft PR into
`dev` opened early** so CI runs on every push. The manager says when to merge
`dev` in, reparent the first migration onto `alembic heads`, mark it ready
and queue it.

## The constraint that shapes this plan

**No owner design exists for any P5 item** (spec 369-372: "Implementation
does not invent them"; viewers.md 249-256; nothing in docs records one). So
each slice below says which part is buildable now against an **existing**
control, and which waits for a design. Backend, storage, migration, API and
Sheets never wait.

## Parts, in build order, on one branch

Five parts, each its own commit(s), its own migration, its own docs, each
leaving the app working, so a red CI points at one part. The migrations are
a chain on this branch; only the first is reparented when `dev` moves.

| Part | What | Migration | Waits for a design |
| --- | --- | --- | --- |
| **A** | Per-user ratings and expectations on the 7 tables; novel unit remark | yes | no — the existing inline editors are reused |
| **C** | Highlights become personal; the notes page gates edits per section scope; 下周目目標 | yes | per-user highlight group order (see Q4) |
| **D** | Note marks: personal fields on catalogue rows, amount collected, NG reset | yes | editing a personal field in a row; the NG reset button |
| **E** | Mixed sections | yes | how a personal row looks beside catalogue rows |
| **B** | Granted features: favourites per user, quotes and memes behind their switch, the music and mod statuses | yes | nothing of mine — the switches and their panel are P3g's |

C before D and E: its per-scope write gating is what their controls stand
on. **B last**, because the feature switches are created by media-ad's P3g
branch. Until its column names and read helper arrive, every granted feature
is gated through one helper, `has_feature(viewer, key)` in
`app/services/rbac/features.py` (and its frontend twin in `AuthContext`),
answering from a stub, so pointing it at P3g's real columns is a change in
one place when the branches meet. The manager is told when B reaches the
stub.

## What the code does today (surveyed, not recalled)

- `my_rating` sits on `collection`, `franchise`, `series`, `character`,
  `person`, `studio`, `publisher`; `*_expectation` on the three tiers;
  `novel_unit.remark` is a real column. Vocabulary `MY_RATINGS`,
  `FRANCHISE_EXPECTATIONS` (`app/utils/constants.py:119,126`); validated on
  character/person write and on studio/publisher PATCH only, not on tiers.
- They are written only under `manage.catalog` (every tier/entity write),
  withheld from a viewer without `view.personal` by
  `rbac/personal_gate.py` (`strip_personal`, nulled not absent;
  `manage.catalog` exempt), and travel on each table's own Sheets tab
  (Backup is generic over `__table__.columns`).
- Nothing in the backend derives from them. The frontend sorts, filters,
  counts (Statistics, Random Picker, libraries, Seasonal, Future Releases,
  Plan) on the response field. `plan_next._resolve` copies an expectation
  without `strip_personal`. Entity merges copy `my_rating` from the loser.
- Per-user tables key `user_id` → `users.id` CASCADE; reads attach through
  `acting_user_id` (no fallback); Sheets carry `username`; Pull resolves it
  (unknown → skip; missing header → installation owner).
  `user_novel_unit_rating` has **no Sheets tab** — unit ratings do not travel
  today.
- `installation_owner_id(db)` (`services/domain/user_list.py:148`): the flag
  holder, else first non-root by username, else first. Migrations copy it as
  one query (`m1s2ongstat3:101-107`).
- `view.personal` gates exactly: `personal_gate` and the two
  `VIEW_PERSONAL_SECTIONS` (`highlights`, `highlight_episodes`). Its
  description in `permissions.py:148` is stale since #350.
- The notes page gates every write control on one page-wide `isAdmin`
  (= `manage.catalog`); no frontend code reads `section.scope` or
  `author_id`; `/me` carries no user id.
- `highlight_group_order` is a column on the shared `h_comic` / `h_game` row,
  written through the entry PATCH (`manage.catalog`).
- Music: `ix_note_one_music_status_per_kind (media_id, kind)`,
  `seed_music_status` authored by the creating account, `find_flagged_music`
  reads everyone's rows, the frontend picks the first `music_status` row per
  kind.
- No feature-switch code exists. `UserAccessModeDenial` is subtraction-only
  by design ("there must not be" a grant counterpart), so switches need
  their own table.

## Part A — ratings, expectations, unit remark

**Storage.** One table `user_rating`: `user_id` (FK users CASCADE), one FK
column per owner (`collection_id`, `franchise_id`, `series_id`,
`character_id`, `person_id`, `studio_id`, `publisher_id`, each CASCADE),
`my_rating`, `expectation`, timestamps. CHECK `num_nonnulls(owners) = 1`
(the `note` table's shape — a FK per owner, so it cascades); CHECK
`expectation IS NULL OR` the owner is a tier; unique per user and owner,
NULLS NOT DISTINCT. A row with neither value is deleted, like
`user_novel_unit_rating`. One table rather than seven: they are one
concept, read and written one way; the owner-column shape is already the
house pattern.

The unit remark goes **beside the unit rating**, as the spec says:
`user_novel_unit_rating.remark`.

**API.** Responses keep their field names (`my_rating`,
`collection_expectation`, …, unit `remark`), now filled with **the viewer's
own** value through an `attach_ratings` step beside `attach_list_fields`;
no account → null. So the frontend's sorts, filters and statistics keep
working and read the viewer's own data. Writes:
`PUT /api/me/ratings/{owner_type}/{owner_id}` `{my_rating, expectation}`
under `self.list` (the permission the list and seasonal ratings use);
vocabulary validated for all seven. The tier/entity create/update schemas
drop the columns: they no longer write the catalogue. The unit remark is
written with the unit rating in `_write_unit_ratings`.
`personal_gate` loses these fields (they are the viewer's own or null) and
is deleted if nothing is left in it. `plan_next` reads the viewer's
expectation. Merges move a loser's `user_rating` rows to the survivor where
the survivor has none.

**Migration.** Copy every non-null value into `user_rating` /
`user_novel_unit_rating.remark` for the installation owner (the
`m1s2ongstat3` query), then drop the nine columns and `novel_unit.remark`.
Downgrade re-adds the columns and copies the installation owner's values
back; other accounts' rows are lost on downgrade, said in the docstring.
Not `irreversible`. A recovery dump before running it on the company
machine (CLAUDE.local.md).

**Sheets.** A `User Rating` tab carrying `username` and the owner by public
id (the `user_media_list` tab pattern). A `User Novel Unit Rating` tab,
which closes today's gap. Pull of an **old** backup, whose Collection /
Franchise / … rows still carry `my_rating`: those values go to the
installation owner's `user_rating` rows, as an old Note row's author does.

**Frontend (no new UI).** The inline rating/expectation editors on the
group and entity pages, and the novel units editor's remark, call the new
endpoint, and show for a viewer holding `self.list` instead of `isAdmin`.
The Add/Modify forms drop the fields. `useViewScope.personal` checks on
these become `self.list`. Cards show the viewer's own value; a guest sees
the external score (viewers.md 304-305), which the cards already show.

**Tests.** Two accounts rate one franchise and each reads back its own; a
guest reads null; a write without `self.list` is 401 (refusal made to bite
with an existing row); the migration moves values to the owner (and the
mirror: a second account gets nothing); round trip on the new tabs; old
backup Pull; merge moves rows; vocabulary refused on all seven.

## Part B — granted features (last)

The switches, their storage, `/users` panel and Users-tab travel are
**P3g's**, not this branch's. This part consumes them through
`has_feature(viewer, key)` for the four keys the spec names — quotes and
memes, favourites, music status, mod status:
`user_favorite (user_id, quote_id | meme_id)`; `is_favorite` in responses is
the viewer's; the favourites filter is the viewer's; the star toggle shows
for holders of the favourites feature (the existing toggle). Migration moves
`is_favorite = true` to the installation owner, drops both columns. Quotes
and memes are read only with their feature (viewers.md 51, 203; never on
`shared`). The music and mod statuses from Part D become absent without
their feature (spec 435). `/me` carries the viewer's features if P3g does
not already.

## Part C — highlights personal, per-scope note writes, 下周目目標

Six sections to `SCOPE_PERSONAL`; `VIEW_PERSONAL_SECTIONS` goes; the
migration reassigns the six sections' rows to the installation owner.
`h_comic_highlights`'s `owner_where` stays. The notes page computes
**can-write per section** from its scope (catalogue → `manage.catalog`,
personal → `self.personal_notes`) instead of one `isAdmin`, which also
fixes today's gap where a `user` cannot edit its own remark list, todos or
saves on the page. `/me` gains the user id or responses a per-row `mine`
flag (chosen when building — the flag is preferred, it does not widen
`/me`). 下周目目標: a personal `text_links` section in `ng_plus` after
`ng_before_starting`, rendered by the existing component.
Group order: see Q4.

## Part D — note marks

`note_mark (user_id, note_id → note CASCADE, values JSONB)`, unique per
user and note — `game_choice_mark`'s shape. `NoteField.personal` marks
`collected`, `amount_collected` (new), `beaten`, `completion`, `my_value`,
and the music and mod `status`, the last three `granted` by a feature.
The migration moves today's values into the installation owner's marks and
clears them from `note`; `ix_note_one_music_status_per_kind` stays (the
`music_status` row stays catalogue, one per anime list) and its status
moves to marks. Reads overlay the viewer's mark values onto the row; a
viewer without a mark sees the field empty; without the feature the field
is absent (spec 435). Writes: `PUT /api/notes/{id}/mark`. NG reset:
`POST /api/notes/ng-reset` for one owner, clearing the viewer's collected
and amount on rows marked yes, and every `beaten`. Sheets: a `Note Mark`
tab by `username`. **Editing a personal field in a row and the NG reset
button wait for a design**; `quick_edit` (`my_value`) and the music status
bar exist and are reused.

## Part E — mixed sections

`NoteSection.mixed` on the ten sections the spec names; a row-level
`note.personal` boolean (a row's kind cannot be its section's scope here).
Reads: catalogue rows plus the viewer's own personal rows. Writes: holders
of `manage.catalog` write catalogue rows only, others personal rows only
(spec 450-458). Reorder renumbers one kind at a time; a user's rows sort
after the catalogue rows within each group. Never promoted. **How a
personal row looks waits for a design.**

## Questions for the manager (and the owner where marked)

- **Q1.** *(Settled: one branch, parts A, C, D, E, B in that order.)*
- **Q2. `view.personal`** gates nothing once Parts A and C land. Remove the
  permission (seeds, grants, `useViewScope.personal`) in Part C, the part that
  empties it? Recommendation: yes.
- **Q3. The admin** keeps no personal data: after Part A its responses carry
  null ratings and it cannot write one. Today the admin edits ratings inline
  on group pages. Confirm that is intended now, rather than waiting for the
  P-slice that removes the admin's entry pages. Recommendation: yes — the
  spec settles it, and a write the admin makes now would be filed under an
  account that keeps no data.
- **Q4 (owner). Highlight group order** becomes per user with the rows:
  a per-user order table (the shared column moves to the installation
  owner and is dropped), or keep the shared order as everyone's default?
  Recommendation: per user.
- **Q5 (owner). The review queue's waiting music** reads every account's
  statuses today. After Part D: the viewer's own marks. Recommendation: the
  viewer's own.
- **Q6 (owner). Designs needed**, in the order the parts reach them:
  per-user highlight group order if Q4 is per user (C), editing a personal
  field in a row and the NG reset button (D), a personal row in a mixed
  section (E). Each part ships its backend complete and the rest of its UI
  on existing controls. With one branch for all of P5, a design that has not
  arrived when the rest is done is the one thing this branch cannot finish:
  either the branch waits for it, or that UI follows after the four merges.
  The owner's call.
