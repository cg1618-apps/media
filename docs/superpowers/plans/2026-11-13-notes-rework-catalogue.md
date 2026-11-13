# Notes rework, catalogue half — plan

Builds the catalogue half of `docs/superpowers/specs/2026-11-12-notes-rework-design.md`.
Out of scope (personal, waits for the account rework): amount collected, the
NG reset button, 下周目目標, any per-user mark.

Branch `feat/notes-rework`, worktree `media_notes_rework`, database
`media_notes_rework`. One PR into `dev`. **It adds an Alembic revision, so its
release takes the gated lane.**

## What the code does today (read, not recalled)

- Free-text `select` fields in a structured section render as a plain
  `<input>` (`ScalarInput`, `StructuredSection.jsx:246-288`); nothing suggests
  values. Category suggestions exist only at section level — `kind_category` /
  `link_text_category` — collected by `NotesContext.jsx:294-314` into
  `optionValues` and by `NOTE_OPTION_CATEGORIES` (`note_sections.py:2107`) into
  `credit_roles.OPTION_CATEGORIES`. `NoteField` carries no category.
- A category is a bare string on `system_option.category`; no table, no
  whitelist in the API. The System Option admin tab on `/add`, `/modify`,
  `/delete` has two sub-tabs, `OPTION_SUB_TABS` (`OptionSubTabBar.jsx:13`),
  split by `categoriesForSubTab` (`lib/optionCategoryGroups.js`) on
  `TAG_CATEGORIES` from `/api/constants`.
- `groupable_by` is silently ignored on a `hierarchical` section
  (`StructuredSection.jsx:879-882`, `!section.hierarchical`), and
  `GroupedRows` groups a flat list. No section combines the two today.
- The structured form shows every field on every row; nothing is
  parent-aware (`StructuredForm`, `emptyDraft`, `toPayload`, `invalid`).
- `PATCH /api/notes/{id}` changing `section` keeps the old `sort_index`
  (`note.py:691`); only `create_note` appends. No UI moves a row between
  sections; the nearest precedent is ResourceTree's native "Move to…"
  `<select>` (`components/resources/ResourceTree.jsx:201-236`).
- `reviews_and_comments`: text_links, personal, owners `H_OWNERS`,
  `groups_by_owner={"h-game": "reviews"}`. `public_reviews` (text_links,
  catalog) and `personal_reviews` (text, personal) exclude `H_OWNERS`. Same
  shape for the move, so it is a `section` rewrite and nothing else.
- The three 物品 sections are exactly `_named_thing_fields(collected=True)`;
  技能 uses it with `collected=False`.

## Decisions taken here (say if any is wrong)

1. **Field-level suggestion category.** `NoteField.option_category: str | None`,
   allowed only on a free-text `select` (no `options`) — import-time check.
   Served as `NoteFieldOut.option_category`. Validation unchanged: still free
   text.
2. **Category names**, one per section: `Character Group` (角色 `group`),
   `Collectible Type` (收集物 `type`), `Item Type` (道具 `type`),
   `Geography Group` (地理 `group`). Only these four — see question B.
3. **Seeded with no scope rows**, so game and h-game both get them
   (`?scope=` treats no rows as everywhere). 可攻略 is not scoped to h-game.
4. **Their own sub-tab.** `NOTE_SUGGESTION_CATEGORIES` (the field-level ones)
   is served on `/api/constants` as `note_suggestion_categories`, unioned into
   `option_categories` as today so pickers still know them; a third entry in
   `OPTION_SUB_TABS`, `{ key: "notes", label: "Note Suggestions", icon:
   "fa-lightbulb" }`; `categoriesForSubTab("notes")` returns them and
   "options" now excludes them. Song Type / Song Source stay in Options.
   An empty category (Geography Group) shows in the picker because it is in
   the constant, not because a row exists.
5. **Collected** gains `collected` after `not collected`.
6. **Amount total**: `amount_total`, `FIELD_TEXT` in `fields`, label "Total",
   on the three collected sections only. Text, like the stat values — there is
   no number field type and adding one is not this work.
7. **NG Reset**: `ng_reset`, `FIELD_SELECT` options `("yes", "no")`,
   `default="yes"`, in `fields`, on the three collected sections. The migration
   backfills `yes` on existing rows, and the validator still accepts an absent
   key (an old sheet row), which readers treat as yes.
8. **攻略資源 grouping**: a `group` field (free-text select on `kind`) and
   `groupable_by="group"`. No category — the spec names none.
9. **地理 Geography**: key `geography`, structured, `GAME_OWNERS`, catalog,
   `hierarchical`, fields group (`kind`, free-text select, `Geography Group`),
   name (`title`), description (`content`), links; `require_any=(("name",),)`;
   `groupable_by="group"`.
   - `_check_groupable_by` accepts hierarchical when the field is
     column-backed (grouping reads the column).
   - **Only a root carries a group**: `_validate_structured` refuses a group on
     a row with a `parent_id` (422 "Only a top-level row carries a group."),
     so a PATCH reparenting a grouped root must clear it too.
   - Frontend: the form hides the group field for a child draft and a child
     being edited; grouped view groups the **roots** by value (first
     appearance, ungrouped last) and draws each root's subtree under it;
     a move stays among siblings and sends the whole tree depth-first in the
     drawn order. Same toggle as every `groupable_by` card.
10. **Todo quick move**: `NoteSection.quick_move: bool` on the four buckets
    (not `saves`). `section_out` resolves `move_targets: [{key, label}]` — the
    owner's other `quick_move` sections in the same group. `TextLinksSection`
    draws a native "Move to…" `<select>` beside Edit/Delete (the ResourceTree
    pattern, so no new layout) and calls `onUpdate(id, {section})`.
    Backend: a PATCH that changes `section` without sending `sort_index`
    appends to the end of the target section.
11. **Reviews**: `public_reviews` and `personal_reviews` take `ALL_OWNERS`;
    `reviews_and_comments` leaves the registry. For h-comic and hentai the two
    render in a 評論 card of two; for h-game, in the existing 評論 card.
    Migration rewrites `section` on every `reviews_and_comments` row to
    `public_reviews`, `author_id` kept as provenance. Pull maps a sheet row's
    `reviews_and_comments` to `public_reviews` (`parse_note_from_sheet`).

## One migration

`down_revision` re-read against `alembic heads` at the moment it is written
(today `v1i2ewperms34`).

- upgrade: seed the settled values (idempotent, the `m1s2ongstat3` pattern,
  frozen constants); `reviews_and_comments` → `public_reviews`; backfill
  `fields.ng_reset = 'yes'` on `weapons_and_gear`, `items`, `collectibles`.
- downgrade: `public_reviews` rows on h-comic/hentai/h-game media back to
  `reviews_and_comments` (exact: those owners had none before); drop the
  `ng_reset` key; `collected` → `fully collected` (the old vocabulary's nearest
  truthful value); seeds left in place, as `m1s2ongstat3` does. Not
  `irreversible`.

## Order of work (each step: failing test first)

1. Registry + schema: decisions 1, 5-9, 10's flag, 11's owners. Unit tests in
   `test_note_sections.py`, `test_game_note_sections.py`,
   `test_note_schemas.py`, `test_h_game_domain.py`, `test_game_notes_layout.py`
   (update the pinned lists, `NOTE_OPTION_CATEGORIES`, scope counts).
2. Router: append on section change; child-group refusal. `test_note.py`,
   a new `test_geography.py` modelled on `test_story_list.py`;
   `test_h_comic_notes.py`, `test_h_game_notes.py` rewritten for the new reviews.
3. Migration + Pull mapping. A migration test in the shape of
   `test_music_status_migration.py`; a formatter test.
4. Constants + sub-tab. `test_constants_endpoint.py`,
   `optionCategoryGroups.test.js`, `OptionsAddTab.test.jsx`.
5. Frontend structured: SuggestInput for `option_category`, tree grouping,
   child hides group. `StructuredSection.test.jsx`,
   `StructuredSection.groupable.test.jsx`, `NotesTemplate.test.jsx`.
6. Todo move. `TextLinksSection.test.jsx`.
7. Fast checks, `npm run build`, notify the owner, touched backend tests under
   the lock, `alembic heads`, docs, PR, CI, merge.

## Docs in the same change

`docs/systems/notes.md` (registry table, groups, gated types, scope counts,
field specs, vocabularies, components), `docs/options.md`,
`docs/entry-types.md`, `docs/authorization.md` if it counts sections — grep
the claims (`reviews_and_comments`, `14`, `57`, `not collected`), not the
files. Then delete this plan; the spec stays.

## Settled with the manager

- **A.** 地理 sits in 圖鑑與名詞 `compendium`, declared straight after 敵人,
  for game and h-game alike — no override. Confirmed by the owner.
- **B.** Only the four categories.
- **C.** The sub-tab is "Note Suggestions". Confirmed by the owner.
- A and C go into `docs/notes/decisions.md` when this plan is folded into the
  docs.
