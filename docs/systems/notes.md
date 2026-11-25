# Notes

Last verified: 2026-11-25

## What this is for

Notes are the structured commentary you attach to anything in the library: a media entry (anime, comic, book...), one of the three grouping tiers (collection, franchise, series), or - for 備註 Remark and 個人筆記 Personal Notes only - one of the five entities (studio, publisher, person, character, identity). Every bullet — an advantage, an episode comment, an OP you still need to find, a link to a resource — is one row in the single `note` table, and a backend registry decides which *sections* exist, which owners they apply to, and what each row may contain. The frontend notes page reads that registry and renders it; it does not know section names itself (with two narrow, documented exceptions). An owner's remarks are just one more section, `remark`, read and written in the Notes card like the rest.

## Model

The table lives in `app/models/note.py` (class `Note`, `__tablename__ = "note"`). It is deliberately **one wide table**: every section stores into the same columns and leaves the ones its shape does not use as null. Adding a section is a registry entry, not a migration; adding a *shape* costs one nullable column.

| Column | Type | Notes |
| --- | --- | --- |
| `system_id` | UUID PK | Generated with `uuid.uuid4()`. |
| `media_id` | UUID, indexed | FK `media.system_id` ON DELETE CASCADE. Set when the owner is any of the twelve media types. |
| `collection_id` / `franchise_id` / `series_id` | UUID, indexed | FK to the matching tier table, ON DELETE CASCADE. Set when the owner is a grouping tier. |
| `studio_id` / `publisher_id` / `person_id` / `character_id` / `identity_id` | UUID, indexed | FK to `studio`, `publisher`, `person`, `character` and `character_identity`, ON DELETE CASCADE. Set when the owner is an entity. `ENTITY_NOTE_COLUMNS` (`app/models/note.py`) maps each owner type to its column. |
| `author_id` | UUID, indexed, **NOT NULL** | FK `users.id` ON DELETE CASCADE. Who wrote the row — always set, whatever the section's scope, because a catalogue note has an author too and that is the only provenance the catalogue has. Never read from the payload (`NoteBase` has no such field): the router stamps whoever is asking. |
| `section` | String, indexed | Key of an entry in `NOTE_SECTIONS` (`app/utils/note_sections.py`). |
| `parent_id` | UUID, indexed | FK `note.system_id` ON DELETE CASCADE. The row this one nests under, for a section whose registry entry sets `hierarchical`. Unbounded depth. CASCADE rather than SET NULL: promoting every child to a root on a delete reads as a flat pile rather than as a loss, which is harder to notice. In a [mixed section](#mixed-sections) the delete route re-homes members' rows before the CASCADE runs, so it takes only catalogue rows. Nothing at the database level keeps a child in its parent's section — a CHECK cannot read another row — so `_validate_parent` in `app/routers/note.py` owns that, along with refusing a cycle at any depth. |
| `locator` | String | "Where in the work": episode, chapter, scene, timestamp, or source. One free-text column; the section supplies the label and whether it is required. Renamed from `episode` by migration `alembic/versions/l1o2c3a4t5o6_note_episode_to_locator.py`. |
| `kind` | String | First dropdown, only where the section declares `kinds` (highlight type, OP/ED change type) or a `kind_category` (the free-text Song Type of an OP or ED). On `resources` and `easter_eggs` it is the row's optional free-text Group (`kind_is_group`), which on `easter_eggs` is also suggested from "Easter Egg Group". On `music_status` it names the song list the row is about. |
| `status` | String | The column a status-shaped value is read into. On the sections whose status is **personal** — the song lists, `music_status`, and the structured `collected`, `beaten`, `completion` and mods `status` fields — it is never stored: it stays null on the row, and every read fills it with the viewer's own value from `note_mark` (see [Personal values on catalogue rows](#personal-values-on-catalogue-rows-note-marks)). Kept separate from `kind` because one row needs both (which cut it is vs. how far my tracking has got). |
| `title` | String | The name half of a `name_links` row, or the song name on a `music_track` row. |
| `content` | Text | The body. |
| `links` | JSONB | A list of **titled links** `{"text": str｜null, "url": str}`, on every section that takes links (`note_sections.takes_links`). `text` is the link's optional title; `url` is required. One shape for every section, so no reader has to ask which a row is in. Always a list, even for shapes that allow one link, so multi-link support needs no migration. See [Links](#links). |
| `entries` | JSONB | The `name_entries` shape's ordered items: each `{"type": "text"｜"link", "value": str, "label": str｜null}`, in array order. Deliberately **not** folded into `links`, which holds titled links and nothing else — one column meaning two things is how subtle bugs start. Added by `alembic/versions/g1a2m3e4s5_add_games.py`. |
| `fields` | JSONB | The `structured` shape's registry-declared fields, as a flat object keyed by `NoteField.key`, plus any nested list a `list` field holds. Only the fields the section's spec does **not** map onto a column live here — a structured section's name goes in `title` and its description in `content` — so this carries the leftovers (a variant, an alias, four stat values) and the nested lists, which no column could hold. Validated against the spec: an unknown key is a 422, never a silently stored one. Added by `alembic/versions/n1f2ields3p4_note_structured_fields.py`. |
| `sort_index` | Float | Ordering within one `(owner, section)`. New rows append at `max + 1.0`. |
| `created_at` / `updated_at` | DateTime | Taipei time via `app/database.get_taipei_now`. Nullable — a Pull from a blank sheet cell leaves them None, so `NoteResponse` tolerates that. |

**`owner_type` and `owner_id` are not stored.** The nine owner columns above replace the pair, because a pair cannot cascade — it leaves orphan rows behind that `media_resolver` can only flag as missing. Both survive as **read-only Python properties** derived from whichever column is set, so the API wire format, the SPA and the Google Sheets tab all speak the pair — and, being properties rather than columns, they stay out of the sheet row. The API still takes `?owner_type=&owner_id=` and translates them onto the columns (`_owner_filters`, `_owner_columns` in `app/routers/note.py`). `meme` has the same shape over the four entry and tier columns; `quote` is entry-only and so takes one `media_id` alone.

Constraint and indexes (declared in `__table_args__`, so `create_all` test databases enforce them too):

| Name | Definition | Why |
| --- | --- | --- |
| `ck_note_one_owner` | CHECK `num_nonnulls(media_id, collection_id, franchise_id, series_id, studio_id, publisher_id, person_id, character_id, identity_id) = 1` | Exactly one owner, enforced by the database rather than by convention. |
| `ix_note_owner_section` | `(media_id, collection_id, franchise_id, series_id, section)` | The only read path the notes page uses for an entry or a tier. Each entity owner column carries its own index. |
| `ix_note_one_music_status_per_kind` | unique `(media_id, kind)` **WHERE `section = 'music_status'`** | One status per anime per song list. `music_status` is anime-only, so `media_id` is the whole owner. Created by `alembic/versions/m1s2ongstat3_music_status_and_song_rows.py`; name and predicate must stay identical. |

Column declaration order is also the Google Sheets column order, because `format_model_for_sheet` in `app/utils/formatter.py` walks `__table__.columns`.

### Shapes

A shape names which columns a section uses. Declared as constants at the top of `app/utils/note_sections.py`; the eight stored ones are collected in `STORED_SHAPES`.

| Shape | Columns used | Rule of thumb |
| --- | --- | --- |
| `text` | `content` | A plain bullet. |
| `text_links` | `content`, `links`, optional `locator` | A body *and* its sources. |
| `episode_text` | `locator`, `content`, `kind` where declared, `links` where the section `takes_links` | Anchored to an episode/chapter. |
| `name_links` | `title`, `links`, and `kind` where the section is `kind_is_group` | A named resource, optionally filed under a group. |
| `name_entries` | `title`, `entries` | A named list whose items are each a line of text **or** a labelled link, in one ordered array. **Currently owned by no section** — see the component table below. |
| `music_track` | `title`, `status`, `locator`, `links`, `content`, and `kind` where the section declares a `kind_category` | One song, whichever list it is in — OP, ED, insert song or OST. |
| `music_status` | `kind`, `status` | How far one whole song list of an anime has got. One row per `(owner, kind)`, never rendered as a card of its own. See [Music](#music). |
| `structured` | *(whatever its `fields` spec names)* + `fields` | The registry-driven shape. The SECTION declares an ordered field spec instead of the shape naming fixed columns, so a section that grows a field is a registry edit rather than a new component and a migration. See [Structured sections](#structured-sections). |
| `external` | *(none — its own table)* | `quotes` → `quote` table, `memes` → `meme` table. Never a `note` row; `validate_note_payload` rejects writes to it. |

### Structured sections

`structured` is the one shape that does not name its own columns. The section declares an ordered **field spec** — `NoteSection.fields`, a tuple of `NoteField` — and one component (`frontend/src/pages/notes/sections/StructuredSection.jsx`) and one validator (`_validate_structured`, `app/schemas/note.py`) serve every section that uses it. The game guide sections need a dozen different field sets; a component and a validator apiece would be a dozen near-identical files.

**Where a value is stored is the spec's business.** A field naming a `column` reads and writes that column at the top level of the payload; a field naming none lives at `fields[key]`.

| `NoteField` | Meaning |
| --- | --- |
| `key` | Its key in the `fields` blob, and its identity in `require_any`. Unique within the section. |
| `label` | What the form and the read view call it. |
| `type` | `text`, `textarea`, `select`, `links`, `list`, `names` or `choice_node`. `links` holds titled links and is always the `links` column - an import-time check refuses a links field stored anywhere else. `names` is a list of free-text, non-empty strings - several allowed - stored in `fields`, never in a column. They are names, not character ids: the editor may suggest the characters cast on the entry, but any string is accepted, and renaming a character does not rewrite a row that named it. `choice_node` (`FIELD_CHOICE_NODE`) is the uuid of one block (a story part, never a branch) in the owner game's choice graph, stored in `fields`, never in a column; the editor offers that game's blocks and the read view shows the block's title. It is the one field type that names a row outside `note` - see [Game choices](game-choices.md#the-save-link). |
| `column` | One of `locator`, `kind`, `status`, `title`, `content`, `links`, or `None` to store in `fields`. No two fields of one section may claim the same column. |
| `options` | The values a `select` accepts. **A select with no options is free text** — the guide sections' type, group and tier are open vocabularies stored in the columns a closed dropdown would use. |
| `required` | This field alone may not be blank. |
| `default` | What a **new** row starts this field on — the row-level twin of `NoteSection.default_kind`, which the structured shape does not use. Only ever on a `select` with options, and the value has to be one of them; tests assert both. A defaulted field is **excluded from the emptiness check** (see below). |
| `item_fields` | For `list` only: the shape of one nested row. A `list` field is never column-backed — no column can hold a list of rows. A single item field makes it a list of texts (the NG 多周目 `points`), and its editor then gives each text the full width rather than half a row. |
| `quick_edit` | Render an inline editor in the read view, saving on blur without opening the row. For a value that changes while playing rather than while writing. |
| `placeholder` | Overrides the label in the input. |
| `option_category` | The `system_option` category whose values the editor suggests, as it is typed in. Only on a `select` declaring no `options` — a free-text one — and checked at import (`_check_option_categories`). Suggestions only: the value stays free text and is validated as before. Served as `NoteFieldOut.option_category`; see [Suggestion categories](#suggestion-categories). |
| `suggest_from` | The key of another section whose rows' names (their `title`) the editor suggests — 支線任務 Side Quests' two NPC fields name `characters_guide`, so they offer the owner's 角色 Characters. Only on a `text` field or a `names` field stored in `fields`, and the named section must have a `title`-backed field and serve every owner this one does; checked at import (`_check_suggest_from`). Suggestions only: any text is accepted, and the value is a name rather than a row id, so renaming or deleting the character rewrites nothing. Served as `NoteFieldOut.suggest_from`; see [Suggestions from another section](#suggestions-from-another-section). |
| `shown_when` | `(field key, value)`: the field is drawn, in the form and on the read view, only while that field of the same row holds that value; a blank reads as that field's `default`. Display only — a hidden field keeps what it stores, so turning the steering field back brings the value back. The steering field must be a closed `select` of the same section and the value one of its options, checked at import (`_check_shown_when`). Served as `NoteFieldOut.shown_when`, `{field, value}`. |
| `view_hidden` | The read view does not draw the field; it only steers others (the 物品 sections' `has_amount`). Served as `NoteFieldOut.view_hidden`. |
| `view_labels` | `((value, label), ...)`: the read view draws the field only while it holds one of these values (a blank reading as its `default`), as that label, at the right end of the row's line. For a field whose usual value says nothing and whose exception is worth a flag — NG Reset reads "Won't Reset" on a `no` row and nothing on a `yes` one. Only on a closed `select`, naming its options; checked at import (`_check_view_labels`). Served as `NoteFieldOut.view_labels`, `{value: label}`. The form still offers every option. |

Four rules sit on the section rather than on a field: **`require_any`** is groups of keys where at least one must be filled (an entry needs an order number *or* a name, and may have both), and **`hierarchical`** lets rows carry a `parent_id` and render as a tree. A flat section refuses a parent outright. **`group_by`** names one of the section's `names` fields; the read view draws one group per name, and a row naming two appears under both. The card carries a **Group by** toggle for it too (on by default, remembered per section in the reader's browser); turned off, the rows read as one flat list, which is where they are reordered - a row in two groups cannot be moved within one of them without moving in the other. It is display-only, and it is checked when the module is imported: a `group_by` naming anything but a `names` field of the same section fails the import. **`groupable_by`** names one of the section's `select` fields, and every game section with an optional, free-text bucket names it: 玩法系統 Gameplay Systems, 操作 Controls, 職業 Classes, 技能 Skills, the three 物品 sections, the three typed NG 多周目 sections, 支線任務 Side Quests and 模組&工具 Mods & Tools name `type`, 角色 Characters, 地理 Geography and 攻略資源 Guide Resources name `group`, and 敵人 Enemies names `tier`. 存檔 Saves does not: its checkpoint defaults to `regular`, so every row has one and it is a property of the save rather than a bucket. The card then carries a **Group by** toggle named after the field - *Group by type*, *Group by tier* - (on by default, remembered per section in the reader's browser) that draws one group per value, in the order each value first appears, with the rows carrying none in a trailing group. A section also marked **`always_grouped`** has no toggle and no flat view: it is always drawn grouped, whatever the browser remembered, and its rows are moved within their groups. 角色 Characters, 地理 Geography and 攻略資源 Guide Resources, the three grouped by `group`, are always grouped; the type and tier toggles stay toggles. `always_grouped` without a `groupable_by` fails the import (`_check_always_grouped`), and it is published on `NoteSectionOut`. Unlike `group_by`, no group order is stored anywhere: the groups follow the rows' `sort_index`, so moving a group or a row within one saves the whole section's row order through `PATCH /api/notes/reorder`, grouped. It is checked at import the same way, and on a `hierarchical` section the field must also be column-backed (`_check_groupable_by`). A section both `hierarchical` and `groupable_by` — 地理 Geography and 支線任務 Side Quests — groups its **top-level rows** and draws each one's subtree beneath it; only a top-level row carries a value, and `_validate_structured` refuses one on a row with a `parent_id` (422 "Only a top-level row carries a group."), checked on the row as it will be, so a PATCH that reparents a grouped row must clear its group in the same request. **Renaming a group.** A group's name is a value stored on each of its rows, so a named group's header carries a rename control (a pencil, "Rename group <name>", for a viewer with a row of that group to edit) that renames the group once rather than row by row: `POST /api/notes/rename-group` rewrites, in one transaction, the `groupable_by` column (on 地理 Geography, the top-level rows only, since nothing reads a child's), Resources' `kind`, or the one name inside each row's `group_by` names list (a row that already has the new name keeps it once). It renames exactly the rows the caller could edit one by one: every row of a catalogue section for a `manage.catalog` holder; in a mixed section those catalogue rows plus the caller's own personal rows, so a member renaming a group shared with the catalogue moves only its own rows into the new name; in a personal section the caller's own rows. On a `group_by` section the name is renamed in the caller's own group order too (`user_highlight_group_order`, the order `PUT /api/me/highlight-group-order/{media_id}` writes), keeping its place. Renaming onto a name another group already has merges the two; the nameless group has no stored name and cannot be renamed; a closed vocabulary (模組&工具's Mod / Tool) refuses a name outside it. **`owner_where`** limits a section to some owners of its types, as `{owner column: allowed values}`; the router refuses a row on any other owner (422, `_require_owner_where` in `app/routers/note.py`, after the owner is known to be visible) and the page renders no card for it. Both are published on `NoteSectionOut`.

**Why one JSONB column and not a column per field.** Most of what the structured sections need already has a column — a name is `title`, a description is `content`, a dropdown is `kind` or `status` — so `fields` carries only the leftovers and the nested lists. A column per field would put a dozen mostly-blank columns on a table all twelve owner types share, and those columns are also the Google Sheets Note tab; the nested lists would need JSONB regardless. The cost, stated plainly: the leftover scalars have no database-level type and no column to filter on. The values most worth filtering (a beaten status, a completion status) are each viewer's own and live in `note_mark`, not on the row.

**A defaulted field cannot be what makes a row worth storing.** The
`music_track` shape says the same about `default_kind`: a value that is always
set would make every row non-empty, so an untouched draft with a prefilled
collect status would save itself as a row saying nothing. The emptiness check
therefore counts only the fields with no `default` — and that is about which
fields count, not about whether the value was touched, so choosing "skip" and
filling in nothing else is refused too. A test asserts no section defaults
*every* field it has, since one that did could never be saved at all.

**Validation** (`_validate_structured`) replaces the per-shape rules rather than adding to them: a structured section's `kind` and `status` are checked against its spec, not against `kinds` / `statuses`. In order — every blob key is declared; every column no field claims is empty (otherwise a value would be stored where no editor can reach it); each field matches its type and its options (a `names` value must be a list of non-empty strings; a `choice_node` value must be a string that parses as a uuid); each `required` field is filled (an empty `names` list counts as blank); each `require_any` group has one; the row as a whole says something; and, on a section both hierarchical and groupable, a child carries no group.

### Groups

Display-only. A grouped section is still an ordinary registry entry; `group` only decides which card it renders inside. Defined in `NOTE_GROUPS` (`app/utils/note_sections.py`).

| Key | Label | Icon |
| --- | --- | --- |
| `reviews` | 評論&細節 Reviews & Details | `fa-comments` — for an h-comic or a hentai, only 大眾評價 and 我的評價 |
| `analysis_group` | 解析/解惑/討論 Analysis/Discussion | `fa-clapperboard` (keyed `analysis_group` because a section already owns `analysis`) |
| `guides` | 攻略 Guides | `fa-map` — game and h-game only: gameplay systems, controls, guide notes, and for game also beginner and trivia. The way in, not the content |
| `builds` | 養成&流派 Builds & Growth | `fa-chart-simple` — game and h-game only: stats, classes, skills, builds, team composition |
| `gear` | 物品 Items & Gear | `fa-sack-xmark` — game and h-game only: weapons, items, collectibles. **Not** keyed `items`: a section owns that key |
| `compendium` | 圖鑑&名詞 Compendium & Terms | `fa-dragon` — game and h-game only: characters, enemies, game terms, and for game also player terms; for h-game also geography, last |
| `tools` | 資源&工具 Resources & Tools | `fa-screwdriver-wrench` — game and h-game only: mods and tools, guide resources, then the site-wide Resources section, which is its own card for every other owner. Renders near the end, not with the 攻略 run |
| `story_list` | 劇情列表&任務 Story & Quests | `fa-list-ol` — game and h-game alike: the four **hierarchical** story strands, then 支線任務 Side Quests (hierarchical too), then 結局 Endings. Keyed `story_list` though it holds quests and endings too: keys are what code and tests name, the label is what a reader sees |
| `worldbuilding` | 世界觀 Worldbuilding | `fa-earth-asia` — game only: lore, story terms, geography, timeline, mysteries, other. The world it happens in |
| `ng_plus` | NG 多周目 | `fa-rotate` — game and h-game only: flow, carried over, before starting, and 下周目目標 NG+ Goals. What starting over keeps, what to finish before it, and what I mean to do next time |
| `todo` | 待辦 Todo | `fa-list-check` — game and h-game only, 4 personal-scope buckets (a row moves between them in one step, `quick_move`) and then 存檔 Saves, all personal |
| `music` | 音樂 Music | `fa-music` |
| `quotes_memes` | 名言&梗 Quotes and Memes | `fa-quote-right` — every owner but h-comic, hentai and h-game |

**`guides` names a group and no section**, so unlike `analysis_group` it needs no suffix. **`todo` is not called `progress`**: the game detail page already renders a `<Slip title="Progress">` (playtime and achievements) beside the notes, and two cards with one name is unreadable.

**攻略 is five cards, not one.** Its twenty sections (for a game) in one card
would read as a wall of collapsed headers rather than as a guide. Each card answers one
question — the way in (`guides`), how to build (`builds`), what to get
(`gear`), who you meet (`compendium`), and what sits outside the game
(`tools`) — so a section is filed by what it answers rather than by
elimination. `group` is display-only, so filing a section in another card is
a registry edit: no migration, no data change, no frontend change, and each
card collapses on its own when empty. A test keeps every card at two sections or more; a card of one
is a section wearing a second header.

**結局 Endings is in 劇情列表&任務, not 攻略.** An ending is what the story
*does* rather than a guide topic, so it closes the story card, after the
strands and the side quests, and 圖鑑&名詞 is cleanly about the cast, the
bestiary, the map and the glossaries.

**劇情列表&任務 is what happens; 世界觀 is the world it happens in.** The story
card holds the story as a numbered, nestable structure, the quests told
alongside it and how it ends — the same card, in the same order, for a game
and an h-game. 世界觀 Worldbuilding (game only) holds what the plot stands on:
設定 Lore, 劇情名詞 Story Terms, 地理 Geography, 時間線 Timeline, 未解之謎
Mysteries, and 其他 Other, the overflow for a stray story observation. It
renders straight after 劇情列表&任務.

**The game's vocabulary is split by where it is looked up.** 遊戲名詞 Game
Terms (mechanics, currencies, jargon) and 玩家術語 Player Terms (the
community's slang and abbreviations, which no menu in the game uses; game
only) are in 圖鑑&名詞, read while playing; 劇情名詞
Story Terms (places, factions, invented words the plot introduces) is in
世界觀, beside the Lore it names, read while following the story. 玩法系統 Gameplay
Systems — modes, enhancement and upgrade systems, the pull system, stages,
style of play — is in 攻略, straight after 新手 Beginner: Beginner is the
advice, this is the inventory of what the advice is about. All four share
one spec, `_term_fields`: Chinese name (`title`), alternative name
(`fields.name_alt`, named after the entry tables' `*_name_alt`), description.
玩法系統 adds a free-text type (`kind`). None takes links: each is looked up,
not sourced, and a write-up worth keeping belongs in 攻略資源 Guide Resources.

**A section's group can differ per owner.** `groups_by_owner` overrides
`group` for named owner types, the same way `labels` and `kinds_by_owner`
override their defaults, and `group_for(section, owner_type)` resolves it —
`/api/notes/sections` serves the resolved value, so the page never learns that
an override exists. **Four sections use it**, and a test pins the list: an
override puts the same rows in a different card, so a reader of
`NOTE_SECTIONS` who sees `group=` and misses the override would be wrong about
where a section lands. `analysis` and `easter_eggs` are below; `geography`
renders in 圖鑑&名詞 for an h-game, which has no 世界觀, and `resources` joins
資源&工具 on both game owners.

For a film or a series, 解析/解惑/討論 Analysis/Discussion sits beside 分鏡/演出, 伏筆, 對稱 and 猜測 in
its own card, because they are one subject. A game has none of the others,
so that card would hold exactly one section — and an analysis of a game
is read *with* the opinions rather than apart from them. So for `game` and
`h-game` it is a subsection of 評論 Reviews, and `analysis_group` is not
rendered for either. 彩蛋/致敬/細節 Easter Eggs/References/Details follows it there for `game`, so it is
the last subsection of a game's 評論 and 解析 the one before it. H-comic and
hentai have no 解析 at all, and no gated type has 彩蛋.

**Card order is registry position.** `splitBlocks` walks `NOTE_SECTIONS` and emits one card per group in first-appearance order, so where a group's *first* section sits is the only thing deciding where its card lands. Today that reads: Notes → 評論 → 解析 → 攻略 → 劇情列表&任務 → 世界觀 → 待辦 → 音樂 → 名言&梗 → 資源 Resources → 問題 Questions.

### 劇情列表&任務 Story & Quests, and nesting

The story is kept as a **structure** — a numbered, nestable list of the
things it is made of, so "chapter 3, scene 2" is two rows and a parent link
rather than a sentence. There is no prose plot section beside it.

Four strands (`story_list_main`, `_side`, `_character`, `_event`) rather than
one section with a `kind`, for the same reason the 待辦 buckets are four:
`sort_index` orders rows within one `(owner, section)` pair, so a kind-tagged
single section could not order entries *within* a strand. They are built from
`STORY_LIST_STRANDS` by `_story_list_sections()` because they differ only in
key and label — four copies of one spec is four places for them to drift.

**They, 支線任務 Side Quests and 地理 Geography (below) are the `hierarchical` sections.** An entry
nests under another to any depth via `note.parent_id`; two or three levels is the expected shape, and
nothing enforces a limit because the limit would be arbitrary and the router
already refuses a cycle. The rules a schema cannot check live in
`_validate_parent` (`app/routers/note.py`): the parent must exist, share this
row's **owner** and **section**, not be the row itself, and not close a loop at
any depth. A flat section refuses a `parent_id` outright, so a section does not
grow a tree because one payload carried a stray id.

**`require_any = (("order", "name"),)`** is what makes an entry an entry: an
order number *or* a name, and it may have both. "3.2" with no name is a
placeholder somebody will fill in; "The Lake" with no number is an entry whose
position is its parent's business; a description with neither is a body with
nothing to call it. The order number is **free text** on the `locator` column,
because an entry is numbered "3", "3.2", "II", "v1.4" or "Act I" depending on
the work.

**How the page reorders one.** `PATCH /api/notes/reorder` takes ids naming
*exactly* that section's notes and answers 400 otherwise, which is what keeps a
partial list from quietly renumbering half a section, and also when it names
one note twice. A row is dragged among its own siblings only — it never changes
parent by being dragged — so the page flattens its whole tree depth-first with
that move applied and sends all of it, which also leaves `sort_index` ascending
in the order the page draws.

A row whose `parent_id` names something not in the fetched list renders as a
**root**. That should not happen — the router refuses a foreign parent and a
delete cascades — but dropping such a row would hide it with nothing to say so.

### 地理 Geography

Where things are in a game: a region holding areas holding rooms, each a row
of its own. Key `geography`, `structured`, catalogue scope, owners
`GAME_OWNERS`. For a game it is in 世界觀 Worldbuilding, above 時間線
Timeline - where, then when; an h-game has no 世界觀, so for it the section is
the last of 圖鑑&名詞 Compendium & Terms (`groups_by_owner`). Fields: group →
`kind` (free-text select, suggested from `Geography Group`), name → `title`,
description → `content`; no links - a map worth keeping belongs in 攻略資源
Guide Resources. `require_any = (("name",),)`.

It is the one section both **`hierarchical`** and **`groupable_by`**
(`group`). Only a top-level row carries a group: the rows under it belong to
its group by being under it. So the backend refuses a group on a child (422
"Only a top-level row carries a group."), the form leaves the group field out
when drafting a child or editing one (a column-backed field it leaves out is
sent as null), and the **Group by group** view groups the roots, in the order
each value first appears with the ungrouped roots last, and draws each root's
whole subtree under it. A row still moves only among its own siblings, and a
move sends the whole tree depth-first in the drawn order, group after group.

Geography is also [mixed](#mixed-sections): a member's personal row may sit
under a catalogue row or under the member's own, and comes after the catalogue
children of the same parent; a catalogue row may not sit under a personal one
(422 "A catalogue note cannot nest under a personal note."), and another
account's personal row is a parent that is not there (422 "Parent note not
found."). Deleting a catalogue row takes its catalogue subtree (the
`parent_id` CASCADE), but a member's personal row anywhere under it survives:
`_rehome_personal_descendants` in `app/routers/note.py` moves it to the
section's top level first, with its own subtree, after that member's existing
top-level rows and in the order the rows were listed. A member's row under its
own row keeps that parent. Deleting a personal row takes its own subtree, which
is all the author's.

### Section registry

`NOTE_SECTIONS` in `app/utils/note_sections.py`, in display order. "All" = all fifteen owners (`ALL_OWNERS`); "Entries" = the twelve media types (`ENTRY_OWNERS`). Both derive from `media_resolver`, so a new media type joins them automatically. "All + entities" adds the five entities (`ENTITY_OWNERS`: studio, publisher, person, character, identity), which own those two sections and no other. "All but H" leaves out the three gated types (`H_OWNERS`); "All but h-comic, hentai" leaves out two of them — see "The gated types' notes" below the table.

| Key | Label | Shape | Group / standalone | Owners | Kinds (`kind`) | Statuses | Locator placeholder | Locator req. | Singleton | Content req. |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `remark` | 備註 Remark | text_links | flat | All + entities | — | — | — | no | no | no |
| `personal_notes` | 個人筆記 Personal Notes | text_links | flat | All + entities | — | — | — | no | no | no |
| `introduction` | 介紹 Introduction | text_links | reviews (first) | All but h-comic, hentai | — | — | — | no | no | no |
| `advantages` | 優點 Advantages (mixed, kind choice) | text_links | reviews | All but h-comic, hentai | — | — | — | no | no | no |
| `disadvantages` | 缺點 Disadvantages (mixed, kind choice) | text_links | reviews | All but h-comic, hentai | — | — | — | no | no | no |
| `double_edged` | 優缺點 (mixed, kind choice) | text_links | reviews | All but h-comic, hentai | — | — | — | no | no | no |
| `public_reviews` | 大眾評價 Public Reviews | text_links | reviews | All | — | — | — | no | no | no |
| `personal_reviews` | 我的評價 Personal Reviews | text | reviews | All | — | — | — | no | no | no |
| `episode_comments` | 各集評論 Episode Comments (manga: 各話評論 Chapter Comments; game: 各章評論 Part Reviews) | episode_text | reviews | anime, tv-show, cartoon, manga, game | — | — | "Episode, e.g. ep 1" (manga: "Chapter, e.g. ch 1"; game: "Chapter / Part, e.g. Ch 3") | **yes** | no | **every owner it has** |
| `highlights` | 神回/神片段 Highlights | episode_text | flat | anime | 神回, 神片段, 神篇章 | — | "Episode(s), e.g. ep 6" | **yes** | no | no |
| `highlight_episodes` | 神回/神片段 (manga: 神回) | episode_text | flat | tv-show, cartoon, manga | tv-show & cartoon: 神回, 神片段, 神篇章; manga: none | — | "Episode(s), e.g. ep 3" (manga: "Chapter(s), e.g. ch 6") | **yes** | no | no |
| `highlight_passages` | 神片段 | text | flat | book | — | — | — | no | no | no |
| `highlight_moments` | 神場景 Highlights | episode_text | flat | game | — | — | "Chapter / Boss, e.g. Ch 3" | **yes** | no | no |
| `h_comic_highlights` | 亮點 Highlights | **structured** | flat | h-comic (**KR only**, `owner_where`) | — | — | *(on its `chapter` field)* | no | no | no |
| `h_game_highlights` | 亮點 Highlights | **structured** | flat | h-game | — | — | *(on its `route_scene` field)* | no | no | no |
| `analysis` | 解析/解惑/討論 Analysis/Discussion | text_links | analysis_group (**reviews** for game and h-game) | All but h-comic, hentai | — | — | — | no | no | no |
| `cinematography` | 分鏡/演出/巧思/細節 | text_links | analysis_group | anime, anime-movie, tv-show, cartoon, manga, series | — | — | "Episode(s), e.g. ep 3" | no | no | no |
| `craft` | 巧思 | text_links | analysis_group | book | — | — | — | no | no | no |
| `foreshadowing` | 伏筆/前後呼應 Foreshadowing | text_links | analysis_group | anime, anime-movie, tv-show, cartoon, manga, book, series, franchise | — | — | "Episode(s), e.g. ep 3" | no | no | no |
| `symmetry` | 對稱 Symmetry | text_links | analysis_group | same as foreshadowing | — | — | "Episode(s), e.g. ep 3" | no | no | no |
| `speculation` | 猜測 Speculation | text_links | analysis_group | same as foreshadowing | — | — | "Episode(s), e.g. ep 3" | no | no | no |
| `easter_eggs` | 彩蛋/致敬/細節 Easter Eggs/References/Details | text_links | analysis_group (**reviews** for game) | anime, anime-movie, movie, tv-show, cartoon, manga, book, comic, game, series, franchise | free-text Group (`kind_is_group`), suggested from "Easter Egg Group" | — | "Episode(s), e.g. ep 3" (anime-movie, movie: "Scene, e.g. 1:02:30"; manga, book: "Chapter(s), e.g. ch 6"; comic: "Issue(s), e.g. #3"; game: "Chapter / Part, e.g. Ch 3") | no | no | no |
| `beginner` | 新手 Beginner | text_links | guides | game | — | — | — | no | no | no |
| `gameplay_systems` | 玩法系統 Gameplay Systems | **structured** | guides | game, h-game | — | — | — | no | no | no |
| `controls` | 操作 Controls | **structured** | guides | game, h-game | — | — | — | no | no | no |
| `guide_notes` | 攻略筆記 Guide Notes | text | guides | game, h-game | — | — | — | no | no | no |
| `trivia` | 小知識&技巧 Trivia & Tips | **structured** | guides | game | — | — | — | no | no | no |
| `stats_and_points` | 屬性&配點 Stats & Points | **structured** | builds | game, h-game | — | — | — | no | no | no |
| `classes` | 職業 Classes | **structured** | builds | game, h-game | — | — | — | no | no | no |
| `skills` | 技能 Skills | **structured** | builds | game, h-game | — | — | — | no | no | no |
| `builds_and_styles` | 配裝&流派 Builds & Styles | **structured** | builds | game, h-game | — | — | — | no | no | no |
| `team_composition` | 隊伍組成 Team Composition | **structured** | builds | game, h-game | — | — | — | no | no | no |
| `weapons_and_gear` | 武器&裝備 Weapons & Gear | **structured** | gear | game, h-game | — | — | — | no | no | no |
| `items` | 道具 Items | **structured** | gear | game, h-game | — | — | — | no | no | no |
| `collectibles` | 收集物 Collectibles | **structured** | gear | game, h-game | — | — | — | no | no | no |
| `characters_guide` | 角色 Characters | **structured** | compendium | game, h-game | — | — | — | no | no | no |
| `enemies` | 敵人 Enemies | **structured** | compendium | game, h-game | — | — | — | no | no | no |
| `game_terms` | 遊戲名詞 Game Terms | **structured** | compendium | game, h-game | — | — | — | no | no | no |
| `player_terms` | 玩家術語 Player Terms | **structured** | compendium | game | — | — | — | no | no | no |
| `story_list_main` | 主線 Main | **structured** | story_list | game, h-game | — | — | — | no | no | no |
| `story_list_side` | 支線 Side | **structured** | story_list | game, h-game | — | — | — | no | no | no |
| `story_list_character` | 角色 Character | **structured** | story_list | game, h-game | — | — | — | no | no | no |
| `story_list_event` | 事件 Event | **structured** | story_list | game, h-game | — | — | — | no | no | no |
| `side_quests` | 支線任務 Side Quests | **structured** | story_list | game, h-game | — | — | — | no | no | no |
| `endings` | 結局 Endings | **structured** | story_list | game, h-game | — | — | — | no | no | no |
| `lore` | 設定 Lore | text_links | worldbuilding | game | — | — | — | no | no | no |
| `story_terms` | 劇情名詞 Story Terms | **structured** | worldbuilding | game | — | — | — | no | no | no |
| `geography` | 地理 Geography | **structured** | worldbuilding (**compendium** for h-game) | game, h-game | — | — | — | no | no | no |
| `timeline` | 時間線 Timeline | text_links | worldbuilding | game | — | — | — | no | no | no |
| `mysteries` | 未解之謎 Mysteries | text_links | worldbuilding | game | — | — | — | no | no | no |
| `story_other` | 其他 Other | text_links | worldbuilding | game | — | — | — | no | no | no |
| `ng_flow` | 流程 Flow | **structured** | ng_plus | game, h-game | — | — | — | no | no | no |
| `ng_carried_over` | 繼承內容 Carried Over | **structured** | ng_plus | game, h-game | — | — | — | no | no | no |
| `ng_before_starting` | 新周目前需完成 Before Starting | **structured** | ng_plus | game, h-game | — | — | — | no | no | no |
| `ng_goals` | 下周目目標 NG+ Goals | text_links | ng_plus | game, h-game | — | — | — | no | no | no |
| `todo_now` | 現在進行 Doing now | text_links | todo | game, h-game | — | — | — | no | no | no |
| `todo_next` | 接下來 To do next | text_links | todo | game, h-game | — | — | — | no | no | no |
| `todo_later` | 未來 To do in the future | text_links | todo | game, h-game | — | — | — | no | no | no |
| `todo_maybe` | 可能 Might do | text_links | todo | game, h-game | — | — | — | no | no | no |
| `saves` | 存檔 Saves | **structured** | todo | game, h-game | — | — | — | no | no | no |
| `music_status` | 音樂狀態 Music Status | music_status | music (**hidden**) | anime | op, ed, insert_songs, ost — one row each (`one_per_kind`) | All Done, Done, Need, Pending, No Full Version, Not Done (default `Not Done`) | — | no | per kind | no |
| `op` | OP | music_track | music | anime | free text, suggested from "Song Type" (default `normal`) | Need, Pending, No Full Version, Done | "Episode(s), e.g. ep 3" | no | no | no |
| `ed` | ED | music_track | music | anime | same as `op` | Need, Pending, No Full Version, Done | "Episode(s), e.g. ep 3" | no | no | no |
| `insert_songs` | 插入曲 Insert Song | music_track | music | anime | — | Need, Pending, No Full Version, Done | "Episode(s), e.g. ep 3" | no | no | no |
| `ost` | OST | music_track | music | anime | — | Need, Pending, No Full Version, Done | "Episode(s), e.g. ep 3" | no | no | no |
| `op_ed_changes` | OP/ED 變動 | episode_text, **takes links** | music | anime, tv-show, cartoon | 變化OP, 變化ED, 無OP, 無ED, 特殊OP, 特殊ED | — | "Episode(s), e.g. ep 3" | **yes** | no | no |
| `extended_episodes` | 加長 | episode_text | flat | anime, tv-show, cartoon | — | — | "Episode(s), e.g. ep 3" | **yes** | no | no |
| `adaptation` | 改編 Adaptation | text_links | flat | anime, anime-movie, tv-show, cartoon, book, series, franchise | — | — | — | no | no | anime, anime-movie, book |
| `mods_and_tools` | 模組&工具 Mods & Tools | **structured** | tools | game, h-game | — | — | — | no | no | no |
| `guide_resources` | 攻略資源 Guide Resources | **structured** | tools | game, h-game | — | — | — | no | no | no |
| `resources` | 資源 Resources | name_links | **standalone** (**tools** for game and h-game) | All | free-text Group (`kind_is_group`) | — | — | no | no | no |
| `questions` | 問題 Questions | episode_text | **standalone** | All but h-comic, hentai | — | — | "Source, e.g. ep 3" | no | no | **every owner it has** |
| `quotes` | 名言 Quotes | external | quotes_memes | Entries only, but not H | — | — | — | — | — | — |
| `memes` | 梗/迷因 Memes | external | quotes_memes | All but H | — | — | — | — | — | — |

"game, h-game" is `GAME_OWNERS` (`("game", "h-game")`): a section written for games names it rather than `("game",)`, so a future game section reaches h-game by default, and its per-owner overrides (解析 inside 評論) are built over it with `_for_game_owners`. The sections marked "game" alone are the ones an h-game leaves out.

### The gated types' notes

H-comic, hentai and h-game (`H_OWNERS`) take a pared-down set of notes rather
than everything their owner group would give them.

- **H-comic and hentai** keep 備註, 個人筆記, Resources and - h-comic, KR only -
  亮點 Highlights. Of 評論 they keep only 大眾評價 Public Reviews and 我的評價
  Personal Reviews, which make up their whole 評論 card; they have no 介紹, 優點,
  缺點, 優缺點, 解析, Questions or 名言&梗.
- **H-game** keeps game's notes less what does not describe how it plays:
  - 評論: everything but 各章評論 and 彩蛋 - 介紹, 優點, 缺點, 優缺點, 大眾評價,
    我的評價 and 解析.
  - Highlights: only `h_game_highlights`, not game's 神場景.
  - 攻略: no 新手 or 小知識. 圖鑑&名詞: no 玩家術語.
  - 劇情列表&任務: the whole card, as a game has it.
  - No 世界觀 and no 名言&梗.

A row already stored in a section its owner no longer has stays in the table
and still travels to the sheet, but no card renders it and the API refuses a
new one (422).

Per-owner overrides (`labels`, `kinds_by_owner`, `locator_placeholders`, `desc_required`) are resolved for one owner by `section_out()` in `app/schemas/note.py` before they reach the frontend, so the page only ever sees a flat `NoteSectionOut`.

### H-Comic highlights (`h_comic_highlights`)

A KR h-comic's standout scenes, grouped by the female characters in them.
Personal scope, owners `("h-comic",)`, `group_by = "female_characters"`,
`owner_where = {"region": ("KR",)}` - a JP entry is refused a row (422).

| Field | Type | Stored in | Notes |
|---|---|---|---|
| `female_characters` | names | `fields.female_characters` | **required**; the grouping key |
| `male_characters` | names | `fields.male_characters` | |
| `chapter` | text | `locator` | free text, e.g. `1-5` |
| `location` | text | `fields.location` | |
| `label` | text | `kind` | a `kind`-backed field with no options: free text |
| `usefulness` | select | `status` | `H_COMIC_USEFULNESS` |
| `description` | textarea | `content` | |

**The group order is the viewer's, not the rows'.** Rows inside a group
follow `sort_index`. The order of the groups is the viewer's own row in
`user_highlight_group_order`, served on the entry as `highlight_group_order`
(null for nobody signed in and for no order): a list of names written whole
through `PUT /api/me/highlight-group-order/{media_id}` under
`self.personal_notes`, deduplicated with blanks dropped, a non-list a 422, and
deleted for every account when the entry turns JP. Groups follow the list; a
name the list lacks renders after it in first-appearance order, and a listed
name no row carries any more is ignored. The entry update does not take it.

### H-Game highlights (`h_game_highlights`)

An h-game's standout scenes, grouped the same way by `female_characters`.
Personal scope, owners `("h-game",)`, and **no** `owner_where` - every h-game
takes it. The group order is the viewer's own, kept and written exactly as
h-comic's (`normalize_group_order`), without any region clear.

| Field | Type | Stored in | Notes |
|---|---|---|---|
| `female_characters` | names | `fields.female_characters` | **required**; the grouping key |
| `male_characters` | names | `fields.male_characters` | |
| `route_scene` | text | `locator` | labelled **Route / Scene**, free text, e.g. `Route A, scene 3` |
| `audio` | select | `fields.audio` | labelled **Dialogue Audio**; `H_GAME_AUDIO_AVAILABILITY` |
| `h_presentation` | select | `fields.h_presentation` | labelled **H 演出形式**; `H_GAME_H_PRESENTATIONS` |
| `art_style` | select | `fields.art_style` | `H_GAME_ART_STYLES` |
| `label` | text | `kind` | free text |
| `usefulness` | select | `status` | `H_COMIC_USEFULNESS` |
| `description` | textarea | `content` | |

**Dialogue audio, H 演出形式 and art style describe the scene the way the
entry describes the game**, so each offers the options of the `h_game` column
of the same meaning (`dialogue_audio`, `h_presentation`, `art_style`). They are
single-choice where the entry's columns are multi-choice: the entry says what
the game has anywhere, a row says what one scene is. They take the place of
h-comic's `location`, which an h-game highlight does not have.

**On the h-game page** (`frontend/src/pages/detail/HGame.jsx`): the page's one
`NotesProvider` - Game's composition, with 待辦 Todo in the Progress slip - is
handed the entry row, the viewer's `highlight_group_order` and the callback
that saves a new order through `PUT /api/me/highlight-group-order/{media_id}`, and the section renders exactly as on a KR h-comic: one group per
female character, groups dragged by their header's handle or stepped with the arrow keys on it, rows reordered in the flat list behind the **Group by female characters** toggle. An h-game has
no cast, so the `names` inputs offer no suggestions and take any name typed.

**On the h-comic page** (`frontend/src/pages/detail/HComic.jsx`, `HComicNotes.jsx`):
the detail page hands the notes page the entry row, the cast's character names
and the stored group order. A JP entry gets no Highlights card at all
(`owner_where`, see below). The rows render one group per female character
name; each group is dragged by the grip on its header (or moved one place with
ArrowUp / ArrowDown on that grip), and the drop PUTs the viewer's whole new
order of the names on screen to `/api/me/highlight-group-order/{media_id}` -
which is how a name no row carries any more drops out of the list. The new
order shows at once and every group handle is disabled until the save
settles; a failed save puts the stored order back. The rows inside a group have no handle: they follow
`sort_index`. To reorder the rows, turn off **Group by female characters** in
the card header: the rows then read as one list, each once, with a grip apiece,
and a move saves the section's whole order through `PATCH /api/notes/reorder`.
Turned back on, every group shows its rows in that order. The toggle is
remembered per section in the reader's browser. A row naming two female characters is drawn under both, and
under each it lists the other female characters it names, not the group's own.
The `names` inputs suggest the entry's cast by display name and accept any
other name typed (Enter, a comma, the `Add "<name>"` row the suggestions
end with, or leaving the field).

### The 攻略 Guides field specs

Most of the 攻略 sections are `structured`, so their columns are declared
per section rather than by their shape. They are listed together here because
they share one spec vocabulary, whichever of the five cards each renders in. `→ col` names the `note`
column a field claims; a field with no arrow lives in `fields`.

| Section | Fields |
| --- | --- |
| `controls` | type → `kind` (free-text select), control → `title`, description → `content`; `groupable_by = "type"` |
| `trivia` | title → `title`, description → `content`, links → `links` |
| `stats_and_points` | name → `title`, min_value, rec_value, softmax_value, **my_value** *(quick-edit; personal)*, description → `content` |
| `classes` | type → `kind` (free-text select), name → `title`, role, unlock, key_stats, description → `content`; `groupable_by = "type"` |
| `builds_and_styles` | name → `title`, **stats** *(list: name, min_value, rec_value)*, **armor** *(list: body_part, name, special)*, **weapons** *(list: range_type, type, name, special)*, **items** *(list: type, name, amount)*, **skills** *(list: type, name)*, description → `content`, links → `links` |
| `team_composition` | name → `title`, **members** *(list: name, role 定位, build, description)*, description → `content`, links → `links` |
| `skills` | type → `kind`, name → `title`, description → `content`, links → `links` |
| `collectibles` / `items` / `weapons_and_gear` | type → `kind` (free-text select; suggested from `Collectible Type` / `Item Type` / `Weapon & Gear Type`), name → `title`, variant, description → `content`, links → `links`, collected → `status` *(default `not collected`; personal, NG-reset)*, **has_amount** *(label "Amount", `yes` / `no`, default `no`, `view_hidden`)*, **amount_total** *(label "Total", text; shown when has_amount is yes)*, **amount_collected** *(label "Collected amount", text; personal, NG-reset; shown when has_amount is yes)*, **ng_reset** *(label "NG Reset", `yes` / `no`, default `yes`; read only as "Won't Reset" on a `no` row)*; `groupable_by = "type"` |
| `characters_guide` | group → `kind` (free-text select, suggested from `Character Group`), name → `title`, alias, description → `content`; `groupable_by = "group"` |
| `enemies` | tier → `kind` (free-text select, suggested from `Enemy Tier`), region, name → `title`, alias, description → `content`, beaten → `status` *(default `to beat`; personal, NG-reset)*; `groupable_by = "tier"` |
| `geography` | group → `kind` (free-text select, suggested from `Geography Group`; top-level rows only), name → `title`, description → `content`; `hierarchical`, `groupable_by = "group"`, `require_any = (("name",),)` |
| `endings` | name → `title`, completion → `status` *(personal)*, description → `content`, links → `links` |
| `mods_and_tools` | type → `kind`, name → `title`, developer, description → `content`, status → `status` *(personal, granted by `mod_status`)*; `groupable_by = "type"` |
| `guide_resources` | group → `kind` (free-text select, no suggestions), name → `title`, description → `content`, links → `links`; `groupable_by = "group"` |
| `ng_flow` | name → `title`, description → `content`, **points** *(list: text)*, links → `links` |
| `ng_carried_over` / `ng_before_starting` | type → `kind` (free-text select), name → `title`, description → `content`, **points** *(list: text)*, links → `links`; `groupable_by = "type"` |
| the four `story_list_*` strands | order → `locator`, name → `title`, description → `content`, links → `links`; `hierarchical`, `require_any = (("order", "name"),)` |
| `side_quests` | type → `kind` (free-text select, suggested from `Side Quest Type`; top-level rows only), name → `title`, region, cautions *(label "注意事項 Cautions", textarea)*, prerequisite, core_npc *(text, suggested from 角色 Characters)*, **other_npcs** *(`names`, suggested from 角色 Characters)*, **rewards** *(list: text)*, remark → `content`, links → `links`, done → `status` *(label "Status", default `to do`; personal, NG-reset)*; `hierarchical`, `groupable_by = "type"`, `require_any = (("name",),)` |
| `saves` | number → `locator` *(placeholder "This save's slot number")*, name → `title`, checkpoint → `kind` *(`regular` / `main`, default `regular`)*, note → `content`, based on slot *(free text, placeholder "Slot number it was copied from")*, at node *(`choice_node`, key `choice_node`: the block of the game's choice graph the save sits in)*; `require_any = (("number", "name"),)` |

Only a handful of scalar fields in the whole group need `fields` at all —
`variant`, `alias`, `region`, `developer`, `name_alt`, a class's `role`,
`unlock` and `key_stats`, the 物品 sections' `has_amount`, `amount_total` and `ng_reset`, a
save's `based_on` and `choice_node`, a side quest's `cautions`, `prerequisite`,
`core_npc` and `other_npcs` — plus the stat values and the nested lists. Everything else has a column, which is what makes one JSONB column
enough.

**Open vocabularies declare no options and render as free text**: a `type`, a
`group` and a `tier` are the *game's* vocabulary, and a closed list would be
wrong by the second game. The closed ones read the same everywhere: all but
but three are facts about my run rather than about the game, and the
exceptions, `HAS_AMOUNT_OPTIONS` and `NG_RESET_OPTIONS`, are facts about the
game with only two possible answers:

| Vocabulary | Values |
| --- | --- |
| `COLLECT_STATUSES` (the three 物品 sections' `collected`) | not collected, collected, enough collected, fully collected, skip, inapplicable — a progression with the opt-out after it, like the row below. "Collected" is a one-off thing that is simply had; "enough" and "fully" are about a thing collected in quantity, and "enough" is worth distinguishing from "fully" precisely because most things never reach "fully". "Inapplicable" means the row has nothing to collect at all, so "skip" stays a decision rather than doubling as "can't" |
| `HAS_AMOUNT_OPTIONS` (the three 物品 sections' `has_amount`) | yes, no — whether the row is counted at all. Defaults to no, since most rows are one-off things, and a row stored without the key reads as no; both amounts are drawn only while it says yes |
| `NG_RESET_OPTIONS` (the three 物品 sections' `ng_reset`) | yes, no — whether the NG reset clears a viewer's collect status and amount collected on the row. Defaults to yes, the commoner answer, and a row stored without the key (a sheet row from before the field) reads as yes. The read view flags only the exception: "Won't Reset" at the end of a `no` row's line, nothing on a `yes` one |
| `ENEMY_STATUSES` (`enemies.beaten`) | to beat, beaten, cheesed, skip — "cheesed" is deliberately not folded into "beaten": it answers "do I still owe this one a fair fight?" |
| `QUEST_STATUSES` (`side_quests.done`) | to do, in progress, done, missed, skip — "missed" is not "skip": a missable quest that closed before I reached it is not a decision I made |
| `ENDING_STATUSES` (`endings.completion`) | not yet, reached, skipped — "skipped" is a decision, not an absence, so it is a value rather than a blank |
| `MOD_STATUSES` (`mods_and_tools.status`) | 常駐, to use, to play, played, won't — 常駐 is the always-on set |
| `MOD_KINDS` (`mods_and_tools.type`) | Mod, Tool — carried over from the section's old `kinds` dropdown, which every existing row is tagged with |

`skills`, `collectibles`, `items` and `weapons_and_gear` share one spec built
by `_named_thing_fields(variant=…, collected=…, type_category=…)`: they differ
in those three arguments and nothing else. 技能 Skills takes none — a skill is
learned rather than collected, so a collect status on it would be a field
nobody could answer. `collected=True` adds the collect status, Amount, the
amount total, the amount collected and NG Reset together. The two amounts are
text, like the stat values ("12", "12 + DLC"), since there is no number field
type, and both are `shown_when` Amount is yes. Amount, the amount total and NG
Reset describe the game, so they are catalogue; the collect status and the
amount collected describe a run, so they are each viewer's own.


Registry helpers (`app/utils/note_sections.py`): `section_by_key`, `sections_for(owner_type)`, `label_for`, `kinds_for`, `locator_for`, `group_by_key`, `sections_by_scope`, plus the two derived key sets `PERSONAL_SECTIONS` and `CATALOG_SECTIONS`.

### Suggestion categories

A free-text value can be offered suggestions from a `system_option` category
without being closed to them. A section names one for its `kind`
(`kind_category`, the OP and ED Song Type, and the Group of 彩蛋 Easter Eggs
— "Easter Egg Group", no seeded values) or for its link text
(`link_text_category`, Song Source); a structured field names one for itself
(`NoteField.option_category`). Seven fields do:

| Category | Field | Seeded values |
| --- | --- | --- |
| `Character Group` | 角色 Characters `group` | 商人, 重要NPC, 主角, 同伴, 可攻略, 反派 |
| `Collectible Type` | 收集物 Collectibles `type` | 重要物品 |
| `Item Type` | 道具 Items `type` | 重要道具, 任務道具 |
| `Weapon & Gear Type` | 武器&裝備 Weapons & Gear `type` | none |
| `Enemy Tier` | 敵人 Enemies `tier` | none |
| `Side Quest Type` | 支線任務 Side Quests `type` | 大支線, 小支線 |
| `Geography Group` | 地理 Geography `group` | none |

Seeded by migrations `n1o2tesrwk3` and (`Side Quest Type`) `s1q2uests345` with **no scope rows**, so game and h-game
both get them (`GET /api/options/{category}?scope=` treats a value with no
scope rows as offered everywhere). The editor renders such a field as a
`SuggestInput` over the category's values, which `NotesContext` fetches once
per page with the section-level ones; any value typed is stored as typed.

`NOTE_SUGGESTION_CATEGORIES` collects the field-level categories from the
registry, so the set is exactly what the registry names — a new one is a
registry edit. `NOTE_OPTION_CATEGORIES` is the wider set — the field-level
categories and the section-level ones (`Easter Egg Group`, `Song Type`,
`Song Source`) — unioned
into `OPTION_CATEGORIES`. Every one of them is a **common option**: a value
typed into a note field is stored as typed and never added to the category,
so the list grows only on the Add page. `COMMON_OPTION_CATEGORIES`
(`app/utils/credit_roles.py`, `/api/constants` `common_option_categories`)
is that wider set plus `Needs Work Note` and `Country`, and the admin Add / Modify / Delete
pages edit it under a **Common Options** sub-tab of System Option rather
than under Options, its picker grouped as Note Suggestion (the field-level
seven), Music, Needs Work and Studio & Publisher (the rows are ordinary
`system_option` rows, scoped by their category: see
[../options.md](../options.md#common-option-scopes)). A category with no value yet still shows in the
picker, because the constant rather than a row is what lists it. See
[../options.md](../options.md).

### Suggestions from another section

A field may instead suggest the names of the owner's rows in another section
(`NoteField.suggest_from`, a section key). 支線任務 Side Quests' `core_npc` and
`other_npcs` both name `characters_guide`, so a quest's NPCs are offered from
the game's 角色 Characters rows. Nothing is fetched for it: `NotesContext`
already holds every row of the owner, and builds `sectionTitles` —
`{section key: [distinct non-blank titles, in row order]}` — from them, which
`StructuredSection` reads through a context. A `text` field naming it renders
as a `SuggestInput` over those names; a `names` field hands them to
`NamesInput` in place of the cast. Both stay free text: a quest giver nobody
wrote a character row for is still named, and the value is a name rather than
a row id, so renaming or deleting the character leaves the quest as it was.
A viewer's own personal rows of a mixed source section are among the
suggestions, since they are among the rows the page holds.

### Scope

Every section declares a **`scope`**, and the field has **no default** — a section that forgets it fails a test rather than inheriting one, because the wrong inheritance publishes one person's private notes or buries a shared one. Two values plus a null:

| Scope | Sections | Meaning |
| --- | --- | --- |
| `catalog` | 56 — `remark` among them, and the thirteen [mixed sections](#mixed-sections) | One shared set of rows, read by everyone unfiltered |
| `personal` | 16 — `personal_notes`, `personal_reviews`, `episode_comments`, the six highlight sections `highlights`, `highlight_episodes`, `highlight_passages`, `highlight_moments`, `h_comic_highlights`, `h_game_highlights`, 下周目目標 `ng_goals`, `questions`, the four 待辦 buckets `todo_now`, `todo_next`, `todo_later`, `todo_maybe`, and `saves` | One set per user; a viewer sees their own rows and nobody else's |
| `None` | `quotes`, `memes` | The two `external` sections, backed by their own tables. Quotes and memes are **universal** — shared, unfiltered, no per-user copies — so scope does not apply |

The distinction lives in the registry rather than in the schema, so reclassifying a section is a registry edit plus a data reassignment, never an `ALTER TABLE`. `/api/notes/sections` serves `scope` on every entry (`NoteSectionOut.scope`), and the notes page decides from it who may write each section.

Who may write, and whose rows a read returns, follow from it — the router reads `section.scope` rather than carrying its own list:

| Scope | Write (`_authorize_write` / `_authorize_edit`) | Read |
| --- | --- | --- |
| `catalog` | `manage.catalog` | everyone, unfiltered |
| `personal` | any signed-in account holding `self.personal_notes`, own rows only: a row is edited and deleted by its author alone, whatever anyone else's role, and anyone else gets the 404 a missing note gets | `WHERE author_id = viewer`; a logged-out visitor has no id and sees none |

A catalogue row may still carry **personal values** — see the next section — and thirteen catalogue sections also hold each account's own **personal rows** beside the catalogue's — see [Mixed sections](#mixed-sections).

Personal rows are private to their author. There is no way to read another account's, the admin's included: `GET /api/notes` takes no author parameter, and an `author` in the query string is ignored. The six highlight sections are personal like the rest, so every account reads its own highlights and a logged-out visitor none. The full rules live in [../authorization.md](../authorization.md#note-scope).

**`remark` is the catalogue's.** It is a shared list - any number of rows per owner - written under `manage.catalog` through the notes API and read by everyone who can see the owner, a logged-out visitor included. A viewer's own notes on an owner go in 個人筆記 `personal_notes`, which is personal.

### Personal values on catalogue rows (note marks)

Eleven catalogue sections split: the **row** — the item, enemy, ending, stat,
song or mod — is catalogue, and some of its **values** are each viewer's own.
The registry says which (`personal_values(section)` in
`app/utils/note_sections.py`):

| Section | Personal value (mark key) | Lives on the row as | Unmarked reads | Granted by | NG reset |
| --- | --- | --- | --- | --- | --- |
| 武器&裝備 `weapons_and_gear`, 道具 `items`, 收集物 `collectibles` | `collected` | `status` | `not collected` | — | yes, on rows whose `ng_reset` is yes |
| the same three | `amount_collected` | `fields.amount_collected` | absent | — | as above |
| 敵人 `enemies` | `beaten` | `status` | `to beat` | — | yes, every row |
| 結局 `endings` | `completion` | `status` | null | — | no |
| 屬性&配點 `stats_and_points` | `my_value` | `fields.my_value` | absent | — | no |
| 模組&工具 `mods_and_tools` | `status` | `status` | null | `mod_status` | no |
| `op`, `ed`, `insert_songs`, `ost` | `status` | `status` | null | `music_status` | no |
| `music_status` (hidden) | `status` | `status` | `Not Done` | `music_status` | no |

A personal value is a `NoteField` with `personal=True` (plus `granted` and
`ng_resets`), or, for the two shapes with no field spec, a section with
`personal_status=True` (plus `status_granted`), whose `status` is the value
under the mark key `"status"`. Import-time checks (`_check_personal`) keep a
personal value a plain text or select field on a catalogue section: never
required, never nested, never what a row is grouped by, and `granted` /
`ng_resets` only on a personal one. `note_marks.py` checks at import that
every `granted` names one of `FEATURE_NAMES`. OP/ED 變動 does not split.

**Storage.** One row per account per note in `note_mark` (`values` JSONB,
`{key: value}`), `app/models/note_mark.py`. A mark left with no non-empty
value is deleted.

**Reads.** Every row `GET /api/notes`, `POST` and `PATCH` return is the
viewer's (`notes_out` / `note_out` in `app/services/domain/note_marks.py`):
each personal value is put back where it lives — the column, or
`fields[key]` — from the viewer's mark, else the value's `default`, else
null (a `fields` key with nothing to show is left out, and a `fields` left
empty reads null). The response shape is unchanged. What the row itself
holds in those places is never read. A value granted by a feature the viewer
lacks is null on the row and missing from `fields`; the sections listing
leaves the field out (`statuses`, `default_status` and the type-status keys
emptied for a personal status), so the viewer does not see it at all. A
logged-out visitor has no account, so no feature and no mark: it reads every
ungranted value's default.

**Writes.** A catalogue write never stores one: `validate_note_payload`
drops every personal value from the payload first (`drop_personal_values`),
so a key sent on `POST` / `PATCH` is ignored rather than refused, and its
option is not checked. The viewer's own values are written by
`PUT /api/notes/{note_id}/mark` and cleared by `POST /api/notes/ng-reset` —
see [API](#api).

**Granted features** are asked through `has_feature(db, viewer, name)` in
`app/services/rbac/features.py`, `FEATURE_NAMES` = `quotes_memes`,
`favourites`, `music_status`, `mod_status`. It reads the account's own
switch - only a `user` or `super` account with it on holds one, so the
admin sees neither status - and it is the one place a switch is read from
([authorization.md](../authorization.md#per-account-feature-switches)).

### Mixed sections

Thirteen catalogue sections are **`mixed`** (`NoteSection.mixed`,
`MIXED_SECTIONS`): beside the catalogue rows they hold each account's own
**personal rows**, in the same card and the same groups. They are 優點
`advantages`, 缺點 `disadvantages` and 優缺點 `double_edged` (see [Picking
the kind](#picking-the-kind)), 武器&裝備
`weapons_and_gear`, 道具 `items`, 收集物 `collectibles`, 敵人 `enemies`, 角色
`characters_guide`, 地理 `geography`, 配裝&流派 `builds_and_styles`, 隊伍組成
`team_composition`, 攻略資源 `guide_resources`, and `resources`, which is on
every owner type and not only games. An import-time check (`_check_mixed`)
keeps `mixed` to catalogue sections that are neither `singleton` nor
`one_per_kind`. `/api/notes/sections` serves it as `NoteSectionOut.mixed`.

A row's kind is **`note.personal`**, stored on the row because a mixed
section holds both and its scope cannot say which a row is. It is true only on
a personal row of a mixed section; a catalogue row, and a row of a
personal-scope section (personal by its section), carry false. Every row a
response returns carries it (`NoteResponse.personal`).

| | Catalogue row | Personal row |
| --- | --- | --- |
| Read by | everyone, a logged-out visitor included | its author alone — not another member, not a catalogue editor, not the admin |
| Written (`POST`) by | a viewer holding `manage.catalog`: `super`, any catalogue editor - never the admin, which holds no `manage.catalog` | any other signed-in viewer holding `self.personal_notes` |
| Edited and deleted by | `manage.catalog` (401 otherwise) | its author (404 to anyone else) |
| Reordered by | `manage.catalog`, the section's catalogue rows exactly | its author, its own personal rows exactly |
| Nests under | a catalogue row | a catalogue row, or its author's own personal row |

**The server picks the kind.** `_authorize_write` decides it from
`manage.catalog`, and nothing in the payload can: `NoteCreate` has no
`personal` field, so a `personal` key is ignored, and no write ever changes
the kind of a stored row. A personal row is never promoted into the
catalogue. A PATCH may move it only to another mixed section (422 "A personal
note may move only to a section that takes them."). The admin writes
no row of either kind: it holds neither `manage.catalog` nor
`self.personal_notes`.

**Order.** Within a section the catalogue rows come first, by `sort_index`,
then the viewer's personal rows, by `sort_index` (`_ordered`). The page draws
a section's groups — `groupable_by`, Resources' groups, a hierarchical
section's parents — in first-appearance order and keeps the response order
inside each, so a member's rows sit after the catalogue's within every group
and under every parent. A personal row with a group the catalogue lacks makes
a group after the catalogue's.

**Personal values work on both kinds.** A personal row's collected, amount
collected and beaten are the author's marks like a catalogue row's, written
through `PUT /{id}/mark` and cleared by the NG reset, which reaches the
caller's personal rows as well as the catalogue's.

#### Picking the kind

優點, 缺點 and 優缺點 also set **`kind_choice`** (`NoteSection.kind_choice`,
served as `NoteSectionOut.kind_choice`; an import-time check keeps it to mixed
sections). In them the rules above change for a `manage.catalog` holder, which
writes **both** kinds and picks each row's: **personal unless it asks for a
public row**. Public is the catalogue kind, read by everyone.

- `POST` reads `NoteCreate.personal`: a `manage.catalog` holder gets the kind
  it names, personal when it names none. Any other writer gets a personal row,
  and asking for a public one is **401**. A personal row still needs
  `self.personal_notes`.
- `PATCH /{id}/kind` (`{"personal": bool}`) switches a row between the two and
  moves it to the end of its new kind. Only a `manage.catalog` holder may, and
  only on a row it wrote: a public row somebody else wrote is never taken into
  the caller's own list (**422**).
- `PATCH /reorder` renumbers the kind `NoteReorder.personal` names, personal
  when it names none.
- **The page groups each card by kind, Public first**: a Public heading over
  the public rows, then a Personal heading over the viewer's own. The add and
  edit forms show a Personal / Public choice to a `manage.catalog` holder,
  set to Personal on a new row; editing offers it on the editor's own rows -
  every personal row it reads, and a public row whose `author_id` is its
  `user_id` from `/api/auth/me`.
- **On Sheets the kind travels in a `public` column**, not `personal`: Backup
  writes TRUE on a public row of these sections and leaves it blank on every
  other row, and Pull reads these sections' rows as public only when it says
  TRUE. These sections were personal-scope until then, so an older sheet
  carries every row of theirs with `personal` FALSE and no `public` column;
  reading `personal` would publish every one.

Every row these three sections held before the change is personal, its author
unchanged (migration `p1r2oscons3`).

## Rules

Design rules baked into the registry:

| Rule | Where it shows |
| --- | --- |
| **Episode-anchored sections stop at entry level.** Anything whose point is a locator (`episode_comments`, `highlights`, `highlight_episodes`, `op_ed_changes`, `extended_episodes`) is limited to episodic entries — never series/franchise/collection. `cinematography`, `foreshadowing`, `symmetry`, `speculation`, `easter_eggs` and `adaptation` reach series (and franchise for all but `cinematography`) because their locator is optional. | `owners` on each entry in `NOTE_SECTIONS`. |
| **`quotes` is entry-only.** A quote is said in a specific work (`ENTRY_OWNERS`; see the docstring in `app/models/quote.py`). | `NOTE_SECTIONS["quotes"]`. |
| **`memes` is allowed on all owners**, because a running gag often spans a franchise; `meme` carries the four entry and tier owner columns `note` does, so every one of the fifteen owners is reachable. | `NOTE_SECTIONS["memes"]`. |
| **Similar sections are deliberately distinct** (`highlights` vs `highlight_episodes` vs `highlight_passages` vs `highlight_moments`; `cinematography` vs `craft`) so they can drift on purpose. | Module docstring of `app/utils/note_sections.py`. |
| **A game's guide vocabulary is the 攻略 group, not one section.** Twenty sections across five cards (for a game) rather than one with a `kind`, because each is a list kept separately: which build to run is not the same question as where the collectibles are. `guide_resources` holds pointers to somebody else's walkthrough; the site-wide `resources` section (name_links, all owners, standalone) is a separate section games also inherit, and a second card labelled "Resources" would be unreadable — hence distinct keys *and* distinct labels. | The 攻略 run in `NOTE_SECTIONS` and its banner comment. |
| **The 待辦 buckets are four sections, not one section with a `kind`.** `sort_index` orders rows within one `(owner, section)` pair and `/api/notes/reorder` renumbers the whole section, so a kind-tagged single section could not order items *within* a bucket. Moving an item between buckets is a PATCH of `section`, which appends it to the end of the bucket it lands in. The four are `quick_move`: `/api/notes/sections` serves each one's `move_targets` (the owner's other `quick_move` sections in the same card, in registry order), and every row carries a "Move to…" list of them beside Edit and Delete, so moving one is a single step rather than an edit. | The 待辦 run in `NOTE_SECTIONS` and its banner comment; `NoteSection.quick_move`, `NoteSectionOut.move_targets`. |
| **劇情列表&任務 records what happens; 解析 records what it means.** The two are separate cards, and `story_other` exists so a stray story observation lands there rather than drifting into Analysis. | `NOTE_GROUPS`. |
| **`episode_comments` was widened, not duplicated.** A manga is cut into chapters and a game into chapters or parts rather than episodes, but a comment on one segment of the work is the same section, so each gets a `labels` override (manga 各話評論 Chapter Comments, game 各章評論 Part Reviews) and a `locator_placeholders` override rather than a section of its own. An h-game does not take it: it is not reviewed part by part. | `NOTE_SECTIONS["episode_comments"]`. |
| **Music sections stay separate** (`op`, `ed`, `insert_songs`, `ost`, `op_ed_changes`) rather than one section with a dropdown, so "which OPs do I still need?" stays a section, not a filter. Each song list's own status hangs on a `music_status` row keyed by the list's section key, not a fifth list. | Comment above `music_status` in the registry. |
| `group` and `standalone` are mutually exclusive; a test forbids setting both. | `NoteSection` docstring. |
| `locator_required` is section-wide; `desc_required` is per owner. | `NoteSection` fields. |
| **`takes_links` is for `episode_text` alone**: it gives that shape's rows any number of URL-string links, as a `text_links` row has. `op_ed_changes` is the one section that sets it — where the changed OP or ED can be watched; the other episode_text sections stay a locator, a kind and a description. Every other link-carrying shape takes links by construction, so a test keeps the flag to episode_text. Validation is the same either way (check 5 below), and a row's links never count toward check 9: an episode_text row still needs content or a locator. | `takes_links` on `NoteSection`; served on `NoteSectionOut`. |

### Validation (`validate_note_payload`, `app/schemas/note.py`)

Runs on every POST and on the *merged* row of every PATCH. Raises `ValueError`, which the router turns into **422**. After check 4 it drops the row's personal values (`drop_personal_values`), so none of the checks below sees, counts or validates one. In order:

| # | Check | Message |
| --- | --- | --- |
| 1 | `owner_type` in `NOTE_OWNER_TABLES` (`OWNER_TABLES` and the five entities) | Unknown owner_type '…'. |
| 2 | `section` is a registry key | Unknown note section '…'. |
| 3 | Section's shape is a stored shape (not `external`) | Section '…' has its own table and is not stored as a note. |
| 4 | Owner type is in the section's `owners` | Section '…' does not apply to owner type '…'. |
| 5 | `links` only on a section that `takes_links`, each a titled link with a non-blank `url`. A bare URL string is read as a link with no title before this runs (`NoteBase`), and a link with any key but `text` and `url` is refused by the request schema itself (`LinkPair`, `extra="forbid"`) | Section '…' takes no links. / Section '…' links link N needs a URL. |
| 5a | If `kind` given and the section declares neither a `kind_category` nor `kind_is_group`: section has kinds for this owner, and the value is one of them. A `kind_category` makes `kind` free text — the category only suggests; `kind_is_group` makes it a free-text group name (Resources, 彩蛋), which a `kind_category` beside it only suggests | Section '…' takes no kind for owner type '…'. / '…' is not a valid kind for section '…'. |
| 6 | If `status` given: section has statuses, and the value is one of them | Section '…' takes no status. / '…' is not a valid status for section '…'. |
| 7 | `desc_required` for this owner ⇒ stripped `content` non-empty | Section '…' requires content. |
| 8 | `locator_required` ⇒ stripped `locator` non-empty | Section '…' requires a locator. |
| 9 | Emptiness, by shape: `name_links` needs content or title or links (a group alone is nothing); `name_entries` needs a title or at least one entry ("Section '…' needs a name or an entry." — a named bookmark with neither a name nor a single entry is nothing); `episode_text` needs content or locator; `music_track` needs any of content/title/locator/links (kind alone never counts, since OP and ED default it to `normal`, and the status is personal); `music_status` needs a kind ("Section '…' needs a kind: one of ….") and takes nothing else ("Section '…' takes no '…'."); every other shape needs content or links | Section '…' note is empty. |

**An already-empty row stays editable.** A song, or a structured row, whose only value was a personal one — the migrated song rows that were a status and a type — is empty in the catalogue once that value is somebody's mark. A PATCH of such a row passes `allow_empty` (`catalogue_empty` on the stored row) and skips the emptiness refusal of those two shapes; a PATCH can still never empty a row that says something.

A `structured` section takes none of this path: check 4 is followed by the nesting rule (a flat section refuses a `parent_id`) and then by `_validate_structured`, which returns. Checks 5 to 9 are per-shape, and a structured section's equivalents live in its spec — see [Structured sections](#structured-sections). A non-structured section given a `fields` payload is refused outright ("Section '…' takes no structured fields.").

Singleton and one-per-kind uniqueness are **not** here — they need a query, so `_reject_second_singleton` in `app/routers/note.py` does them (422 "This owner already has a '<section>' note." / "This owner already has a 'music_status' note for 'op'."). No registry section is a `singleton` at present; the check is generic and `music_status`'s `one_per_kind` shares it. The same goes for `owner_where`: `_require_owner_where` reads the owner row and answers 422 "Section '…' applies only where region is KR." on POST and on the merged row of a PATCH, so a row cannot be moved onto a JP entry either. And for a `choice_node` field: the schema checks only that the value is a uuid, and `_require_choice_nodes` checks that it names a node of the note's own game (`node_of_game` in `app/services/domain/game_choice.py`), answering 422 "At node must be a node of this game's choice graph." It runs on every POST, but on a PATCH only when the PATCH sends `fields` with a value different from the stored one (or moves the note to another owner), so a save whose stored link names a point this machine lacks can still be edited otherwise. The router stores the value canonical - `str(uuid)`, lowercase, no whitespace - and a blank value removes the key from `fields` without being checked.

### Viewer visibility

`GET /api/notes` applies the RBAC layer:

- If the owner is a media entry and `entry_visible()` (`app/services/rbac/enforcement.py`) says the viewer may not see it, the endpoint answers **404 "Owner not found."** rather than an empty list. A collection, franchise or series owner hidden from the viewer — by a label on it that the viewer's mode lacks, or on a group above it — answers the same 404 (`tier_visible`); every write resolves the tier from the id through `require_visible_owner` and answers it too.
- An **entity** owner is visible when its row exists, the viewer holds its view permission (`view.studio`, `view.publisher`, `view.person`, `view.character`; an identity answers to `view.character`, as its page does) and `shared_record_visible` passes (`_entity_visible`). Anything else is the same 404, on reads and writes alike. A write resolves the entity type from the id itself; a claimed entity `owner_type` is used only to refuse, so an id that is missing or is another kind of entity is 404 too.
- **Personal sections filter by author.** Rows in a `personal`-scope section are returned only when `author_id` matches the viewer; a logged-out visitor, having no id, gets none of them. Catalogue sections fall through untouched. See [Scope](#scope).
- **Personal rows of a mixed section filter the same way** (`note.personal`): the viewer's own beside the catalogue rows, after them. See [Mixed sections](#mixed-sections).
- No field group names a note section.
- `GET /api/notes/sections` lists every section of the owner type, with its `scope`. What it leaves out is a personal value granted by a feature the viewer lacks (see [Personal values on catalogue rows](#personal-values-on-catalogue-rows-note-marks)). A gated owner type the viewer cannot see answers 400 as an unknown one.
- **Personal values are the viewer's.** Every row carries the viewer's own values in place of the personal ones, or their defaults.

## API

Router: `app/routers/note.py`, prefix `/api/notes`. Thin fetch wrappers on the frontend: `frontend/src/pages/notes/api.js`.

| Method | Path | Auth | Params / body | Response | Errors |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/notes/sections` | public | `?owner_type=` | `List[NoteSectionOut]` — registry resolved for that owner and the viewer's features, display order. Each field carries `personal` and `granted`; each section `personal_status` and `status_granted` | 400 unknown owner_type |
| GET | `/api/notes` | public (viewer-aware) | `?owner_type=&owner_id=` | `List[NoteResponse]`, sorted by registry position, then catalogue rows before the viewer's personal rows, then `sort_index` (`_ordered`), each row carrying the viewer's personal values and `personal` | 400 unknown owner_type; 404 owner not visible |
| POST | `/api/notes` | by scope | body `NoteCreate` (`owner_type`, `owner_id`, `section`, `locator`, `kind`, `status`, `title`, `content`, `links`, `sort_index`) | 201 `NoteResponse`; `sort_index` defaults to last-in-section + 1 | 400 unknown section (a key no longer in the registry, such as `reviews_and_comments`, included); 422 validation / second singleton / second `music_status` row for one list |
| PATCH | `/api/notes/reorder` | by scope | body `NoteReorder` `{owner_type, owner_id, section, ordered_ids}` | `{"status":"success","reordered":n}`; rewrites `sort_index` as 0,1,2… — in a mixed section over one kind | 400 unknown owner_type / unknown section / `ordered_ids` names a note twice / `ordered_ids` not exactly the section's rows |
| POST | `/api/notes/rename-group` | by scope | body `NoteGroupRename` `{owner_type, owner_id, section, from, to}` | `NoteGroupRenameResult` `{"renamed": n}` — the rows whose group changed; `from` equal to `to` is 0 | 400 unknown owner_type / unknown section; 401 may not write the section; 404 owner not visible; 422 section has no groups / blank `from` or `to` / `to` outside a closed vocabulary |
| PATCH | `/api/notes/{note_id}` | by scope | body `NoteUpdate` (partial; `exclude_unset`) | `NoteResponse` | 404; 422 — a personal row moved to a section that is not mixed, or the merged row (current values + patch, built from `NoteUpdate.model_fields`) failing validation, which runs **before** mutation so autoflush never writes a bad row. A PATCH may move a note to another owner, or to another section; a PATCH that changes `section` without sending `sort_index` puts the row at the end of its new section, since its old index orders it among rows it is no longer with. |
| DELETE | `/api/notes/{note_id}` | by scope | — | 204 | 404. Audited via `log_deleted_record(db, note, "Note")` (`app/utils/data_control_utils.py`). Every account's marks on the row go with it (CASCADE). |
| PUT | `/api/notes/{note_id}/mark` | `self.personal_notes` | body `NoteMarkWrite` `{"values": {key: value｜null}}` — a key is one of the row's personal values; a value sets it, null or blank clears it, an unnamed key is left alone | the `NoteResponse` as the caller now reads it | 401 without the permission (the admin included) or for a value granted by a feature the caller lacks; 404 note missing or its owner not visible; 422 a key that is not personal on the row's section, a value outside its vocabulary |
| POST | `/api/notes/ng-reset` | `self.personal_notes` | body `{owner_type, owner_id}` | `{"cleared": n}` — how many of the caller's marks changed | 400 unknown owner_type; 401 as above; 404 owner not visible |

The NG reset clears, from the caller's own marks only, every value the registry marks `ng_resets`: `collected` and `amount_collected` on the 物品 rows whose `ng_reset` is yes (a row without the key reads yes), and `beaten` on every enemy. Rows marked no, every other value and other accounts' marks stay.

"By scope" means the section decides: a **catalogue** section needs `manage.catalog`, a **personal** one needs an account holding `self.personal_notes` and reaches only that account's own rows. Somebody else's personal note answers **404**, worded exactly as a missing one — there is no 403 anywhere in this router, because a 403 confirms the row exists as surely as a 200 does. A reorder over a personal section renumbers the caller's rows alone. A **mixed** section decides by `manage.catalog` (except where its writer picks the kind - see [Picking the kind](#picking-the-kind)): its holders write and reorder catalogue rows, every other account holding `self.personal_notes` writes and reorders its own personal rows, and a personal row is edited or deleted by its author alone — 404 to anyone else, the admin included. See [Scope](#scope) and [Mixed sections](#mixed-sections). There is no way to ask for another account's personal rows: an `author` query parameter is ignored.

`/reorder` is declared before `/{note_id}` on purpose (FastAPI matches in order). The notes page calls it (`reorderNotes` in `frontend/src/pages/notes/api.js`) whenever a section's rows, or a `groupable_by` section's groups, are dragged into a new order — every list section, whatever its shape. The singleton `remark` has nothing to order, `music_status` is never drawn as a list, and quotes and memes live in their own tables and are not reordered.

## UI

### NotesTemplate

### 備註 and 個人筆記

Two sections of the same shape - `text_links`, a list of rows each with the
links it rests on - told apart by whose rows they are. 備註 Remark is the
catalogue's: shared, written under `manage.catalog`. 個人筆記 Personal Notes
is personal-scope, each viewer's own. Both reach **every owner**, the five
entities included (the only sections an entity owns), and the two
are read as a pair wherever 備註 appears; a test asserts they share an
`owners` tuple.

Remarks are written only here, in the Notes card: no Add or Modify form and
no detail page carries a remark field of its own - an entity's included: the
studio, publisher, person, character and identity pages draw the same Notes
card for their own owner type.

Three services write entity remarks besides the notes API, all through
`app/services/domain/entity_remarks.py`. `add_remark(db, owner_type,
owner_id, text, author_id=None)` appends a trimmed row at the end of the
list unless a row with the same trimmed text is already there; its author
defaults to the installation owner (`remark_author_id`). **Sync from cast**
adds the cast row's remark to the original's list, under the admin syncing;
**Calculate's cast sync** gives an original whose list is empty its
highest-ranked cast row's remark as the first row (see
[credits-and-tags.md](credits-and-tags.md)). An entity **merge**
(`move_entity_notes`, called by `merge_fill.finish_merge`) moves the loser's
rows - remarks and every account's personal notes - onto the survivor, after
the survivor's own rows in each section, before the loser is deleted.

### Music

An anime has four **song lists** — OP, ED, 插入曲 Insert Song and OST — and
every one is a `music_track` section holding the same row: the song's name
(`title`), the episode it plays in (`locator`, optional for every list), where to
hear it (`links`, any number of link pairs) and a remark (`content`). OP and
ED add a **Song Type** (`kind`), free text suggested from the "Song Type"
option category and starting on `normal`; insert songs and the OST have none.
A row must say something besides its type: any of name, episode, a link or a
remark. The rows are catalogue, written under `manage.catalog`.

**Two levels of status, both the viewer's own.** How far tracking a song has
got (Need, Pending, No Full Version, Done — `MUSIC_STATUSES`) and how far a
whole *list* has got ("All Done", "Done", "Need", "Pending", "No Full Version"
or "Not Done" — `MUSIC_TYPE_STATUSES` in `app/utils/constants.py`) are
personal values granted by the `music_status` feature: each account's own,
in its note mark, read into the row's `status` and written through
`PUT /api/notes/{id}/mark` (see
[Personal values on catalogue rows](#personal-values-on-catalogue-rows-note-marks)).
An account without the feature sees neither. The list status hangs on a
`music_status` row: `section = 'music_status'`, `kind` = the list's section
key, no status of its own. One row per `(anime, list)`, refused twice by the
router (422) and by `ix_note_one_music_status_per_kind`. Every anime created
through the API gets the four rows at once, authored by the creating account
(`seed_music_status`, `app/services/domain/music_status.py`, called through
the anime spec's `create_hook`); an unmarked viewer reads each as "Not Done".

`music_status` is **hidden**: the page renders no card for it. Each song list
instead names it in `type_status_section`, and `GET /api/notes/sections`
resolves that section's vocabulary and default onto the list
(`type_statuses`, `type_status_default`), so the status bar above a list is
drawn from the registry alone — for a viewer holding the feature; for any
other, `type_status_section` is null and both are empty. An import-time check keeps the two sides in
step: the `music_status` kinds must be exactly the sections pointing at it.

**Waiting music.** A list or a song on Need, Pending or No Full Version is
waiting on something, and the review queue's music block lists every anime
where the **caller's own** status on one is such
(`GET /api/data-control/check/music`, `find_flagged_music(db, viewer)` in
`app/services/domain/music_review.py`). Another account's statuses never
list an anime, and a caller without the feature is listed nothing. `Not
Done` is not listed: every list starts there.

**Song link titles.** A song is heard on several services, so a song link's
title says which (`{"text": "YouTube", "url": "https://…"}`); on the four
song lists it is suggested from the "Song Source" option category
(`link_text_category`). Every other section's link titles are free text with
nothing to suggest them - see [Links](#links).

**彩蛋/致敬/細節 Easter Eggs/References/Details** sits last in 解析 on every entry type outside the gated
ones (last in 評論 for a game), and on series and franchise: a hidden reference,
where it plays and where somebody spotted it. One that recurs across a whole
series is noted once on the series, and each entry shows it under its own rows. It is `text_links` like the rest of
解析 - an optional episode in `locator`, a description in `content` and any
number of titled links in `links`.

### Links

Every link a note holds is a **titled link**, `{"text": str | null, "url":
str}`, whatever its section: text_links, name_links and music_track rows, an
episode_text section that `takes_links` (OP/ED 變動), and every structured
`links` field. The title is optional; the pill a link is drawn as reads it,
and the link's host when there is none. One editor writes them all
(`LinkPairsEditor`), and Save waits while a title has no URL rather than
dropping what was typed.

The server stores the one shape only. A request carrying a bare URL string -
a page still running an older bundle - has it read as a link with no title
(`NoteBase`, `as_link_pairs`), and so does a Google Sheet backed up before
every link was titled (see the Sheets table below). A section that takes no
links refuses one (422).

A row of 優點, 缺點, 優缺點, 大眾評價 or 解析 - text_links sections - is a
description, titled links, or both; at least one. A row of 小知識&技巧 Trivia & Tips is
any of a title, a description and titled links. 主線劇情, 支線劇情 and 角色劇情
carry no description: a plot row is its chapter and its links, an arc row
one or more titled links, the titles saying what each is. 各集評論 is an
episode and a comment with no links; 操作 Controls, 職業 Classes and 地理
Geography carry none either.

The notes page is three pieces:

| Piece | File | What it is |
| --- | --- | --- |
| `NotesProvider` / `useNotes` | `NotesContext.jsx` | The data. Fetches the registry and the rows, owns the mutations (`onCreate` / `onUpdate` / `onDelete` / `onReorder` — a reorder is applied locally first through the pure `withSectionOrder`, and while one section's reorder is in flight a second one for that section is dropped and the section is told to disable its grips), dispatches a section on its shape (`renderSection`, which also hands each section the `ownerId`) and counts a card's rows (`blockCount`). The value also carries `notes`, `ownerType`, `ownerId` and `reloadNotes`, for a card outside the notes layout that reads the page's rows: the game's choice graph badges each block with the viewer's saves and reloads the notes after deleting a block. `useOptionalNotes()` returns the value, or null outside a provider, for a component that can sit on a notes page or off it. |
| `NotesBlocks` | `NotesTemplate.jsx` | The layout: which sections go in which card. Takes `hideGroups`. |
| `NotesGroup` | `NotesTemplate.jsx` | **One** group's sections with no card of their own, for a screen that puts a group somewhere else. |

`NotesTemplate` is a provider wrapped around `NotesBlocks`, which is what the
**fifteen** thin wrappers under `frontend/src/pages/detail/*Notes.jsx` (e.g.
`AnimeNotes.jsx`, `ComicNotes.jsx`, `FranchiseNotes.jsx`) render — they fix the
owner type and forward the rest, unchanged by the split.

Four optional props reach the provider through `NotesTemplate` and matter only
to a section declaring the matching registry feature, so no wrapper names a
section: **`owner`** (the owner row) drops a section whose `owner_where` the
row fails (`ownerMatches` in `NotesContext.jsx`; without the row every section
is kept); **`nameSuggestions`** feeds every `names` input; **`groupOrder`** and
**`onGroupOrderChange`** are the owner's stored order for its grouped section
and the callback that saves a new one. An owner type has at most one grouped
section, so one order suffices. `HComicNotes.jsx` and `HGameNotes.jsx` are
the wrappers passing them - `HGameNotes` without `nameSuggestions`, since an
h-game has no cast.

**The game and h-game detail pages compose the three themselves**, and
`GameNotes.jsx` and `HGameNotes.jsx` exist for their Modify tabs only: each page puts
待辦 Todo inside its Progress slip with `NotesGroup`, and renders everything
else with `NotesBlocks hideGroups={["todo"]}`. One provider wraps both, because
two `NotesTemplate`s would be two fetches of the same two endpoints, two
loading states and two error banners on one page. `hideGroups` and `NotesGroup`
are complementary by construction, and a test asserts the group appears exactly
once when both are used.

| Behaviour | How |
| --- | --- |
| Loads registry + rows in parallel (`fetchSections`, `fetchNotes`), then refetches only rows after a mutation; the registry is static for the session. | `useEffect` / `reloadNotes`. |
| Dispatches on `section.shape` via the `SHAPES` map — every stored shape but `music_status` has a component, `structured` → `StructuredSection` among them; a shape with none renders null. A section the registry marks `hidden` (`music_status`) never gets this far: the provider drops it from `sections` before layout or `blockCount` sees it, so its rows neither render nor count towards the Music card, and hands each song list its row as `typeStatusNote` instead. `external` shapes dispatch on **section key** via `EXTERNAL_SHAPES` (`quotes` → `QuoteSection`, `memes` → `MemeSection`) — the first scoped exception to "the frontend never names sections". An external key with no component renders null. | `renderSection`. |
| `splitBlocks()` splits the registry into `flat` (ungrouped, non-standalone), `groups` (one card per group key, registry order), `standalone`. | `splitBlocks`. |
| The **Notes card** holds the flat sections and **renders only when ≥1 flat section is visible** (`flat.length > 0`). A page whose sections are all grouped has no flat section, so no empty headed card. | JSX near the bottom. |
| Each group renders as its own `GroupCard` *beside* Notes (Music is a peer of Notes, not inside it). Standalone sections (`resources`, `questions`) render lifted out with no wrapper — every shape component already draws its own `SectionCard`. | Same. |
| **Collapse-when-empty**: `GroupCard` and `SectionCard` start collapsed when `count === 0` (`useCollapsed` in `sections/ui.jsx`); the user can toggle either. The exception is `openWhenEmpty`: a song list with a status of its own (`type_status_section`) opens with no songs, because its status says something on its own, and a group holding such a list - 音樂 Music - opens with it, so a new anime's lists all show their status. Notes card wears the same chrome but `showCount={false}`. External sections report their row count via `onCount`; while any is still `null` the card counts as unknown and stays open. | `blockCount`, `reporterFor`. |
| **Entry cap**: a section shows its first **three** rows (`VISIBLE_ENTRIES`) and folds the rest behind a mono "Show all (N)" / "Show less" text button under the list; a section of three rows or fewer has no button. It starts folded on every page load and is per section, per page - nothing is stored. It never hides what is being written: the row being edited stays on screen when the section folds (in its own place in the list), and a new row's draft is not in the list at all (see the next row). Every list shape, `QuoteSection` and `MemeSection` included, gets it from `useEntryCap` + `ShowAllToggle` in `sections/ui.jsx`; a singleton text section's textarea is not a list and has none. `StructuredSection` applies it two ways, below. | `useEntryCap`, `capEntries`, `ShowAllToggle`. |
| **The personal mark**: every section whose `scope` is `personal` - its rows are each viewer's own - carries a small circled **P** after its title (`PersonalBadge`, passed as `SectionCard`'s `personal`, and drawn in a singleton section's own header too), titled "Personal - only you see your rows here" and named "Personal" to a screen reader. The three sections whose writer picks each row's kind (`kind_choice`: 優點, 缺點, 優缺點), which hold public rows beside each viewer's own, carry a circled **M** instead (`MixedBadge`, `SectionCard`'s `mixed`), titled "Mixed - public rows everyone reads, plus your own personal rows" and named "Mixed". Catalogue sections, and the other mixed ones, whose personal rows already wear a "Mine" chip, carry neither. | `PersonalBadge`, `isPersonal`, `MixedBadge`, `isMixedByChoice`. |
| **The draft popup**: every Add - a section header's, and a hierarchical row's Add under it - opens the new row's form in a floating panel (`DraftPopup` in `sections/ui.jsx`) rather than at the end of its card, so a long section never puts the form a scroll away from its button. It is a **non-modal** dialog (`role="dialog"`, `aria-modal="false"`): no backdrop, no focus trap, no scroll lock, so the page behind it stays readable, scrollable and selectable - text can be copied from the existing rows into it. It opens docked at the bottom right of the viewport, titled "Add to <section>" (or "Add under <row>"), takes focus on open, drags anywhere by its header, scrolls inside itself past 80% of the viewport's height, and is portalled to `<body>` at `z-40`, under the modals. It closes only through Save, Cancel or its ×, which is Cancel: never on Escape or an outside click, which with the page still in use are what a reader does while copying. Two open at once step 24px apart so neither hides the other. Editing an existing row stays inline, in the row's place. | `DraftPopup`. |
| **Reordering**: every list section an admin sees with two rows or more carries a grip per row (`components/ui/Sortable.jsx` — drag it, or press ArrowUp / ArrowDown on it). Rows are only ever reordered within their own section; sections and groups of sections have a fixed place. Each move sends the section's whole order through `PATCH /api/notes/reorder`; the provider shows it at once and disables that section's grips until the save settles. The grip moves a row by its place among all the rows, folded or not, so the last row shown can be moved past the fold, which unfolds the section. The row being edited has no grip. The flat shapes share one implementation (`useRowReorder`, `ReorderList`, `ReorderRow`, `ReorderHandle` in `sections/ui.jsx`); `StructuredSection` has its own, because it orders a tree and groups. A locator-led section (`episode_text`) is ordered by hand like the rest, not by its locator: a locator is free text — an episode, a chapter, a boss, a source — and has no order to sort by. | `onReorder`, `reordering`, `sections/ui.jsx`. |
| Errors from any card show in one banner above all cards (a group card is a sibling of Notes, so an error must not report inside the wrong one). | `error` state. |

### Series and franchise notes on an entry

An entry's notes also show what its **series** and its **franchise** say in
the same sections. They are plugged into the entry's own section cards, not
drawn as a block of their own, because the reader of an entry's 伏筆 wants the
series-wide 伏筆 beside it.

| Rule | How |
| --- | --- |
| **Where.** The entry detail pages only. Each passes the `series` and `franchise` rows it already resolves for its header (`NotesTemplate` / `NotesProvider` props `series`, `franchise`). The Modify tabs and the Add page's notes panel pass neither and show the entry's own rows alone. | `pages/detail/*.jsx`, `*Notes.jsx` |
| **Which sections.** Only sections the entry itself has. A group's row in a section the entry's owner type lacks (a franchise's `symmetry` on a game) is not shown on the entry. Singleton sections take none: a singleton is one editable textarea, not a list a group's row can join. Of the external sections, 梗/迷因 Memes takes the group's memes (next rule); 名言 Quotes takes nothing, because the registry offers it on entries alone - a quote is said in one work. | `groupNotesFor` in `NotesContext.jsx` |
| **Memes.** A meme is a row of the `meme` table, not a note, so a group's memes never arrive with its notes. For an entry showing 梗/迷因 Memes, the provider reads each group's from `GET /api/meme/?owner_type=series｜franchise&owner_id=` - the read the group's own Memes card makes - and they follow the entry's own memes under the same headings as every other section's group rows, drawn by `GroupMemeRows` (`MemeSection.jsx`): the meme's read view with no Edit, Delete or Add, and the favourite star as a mark (`FavoriteStar readOnly`) rather than a toggle, shown only on a row the viewer has favourited. The endpoint takes the `quotes_memes` feature and drops a meme whose owner the viewer may not see; the section is already gone for a viewer without the feature, so nothing is fetched for one, and a refused or failed read leaves that group out. Which external sections take group rows, and how they read and draw them, is `EXTERNAL_GROUP_ROWS`. | `EXTERNAL_GROUP_ROWS`, `api.fetchMemes`, `GroupMemeRows` |
| **Order.** The entry's own rows first, unchanged and editable; then the series' rows; then the franchise's. Each group's rows are their own sub-list, never interleaved with the entry's and never part of its reorder. | `GroupNotes.jsx` |
| **Labelled.** Each sub-list sits under a dashed rule and a mono "From series" / "From franchise" heading with the group's display name, linked to the group's page (`entityPath`) - there is no separate notes route; Notes is a tab on that page. The sub-list is `role="group"` named "From series: <name>". | `GroupNotes.jsx` |
| **Read-only.** A group's rows are drawn by the section's own shape component in its read view - `isAdmin={false}`, no mutation handlers, and `bare` (no card, no header, no Add) - so no row gets Edit, Delete, a grip, a quick-edit input or an Add-child button, and the read view is the one the section already has, hierarchical, structured and music ones included. The entry cap applies per sub-list. | `SectionCardProvider` in `sections/ui.jsx` |
| **Visibility.** Each group's rows come from `GET /api/notes?owner_type=series｜franchise&owner_id=` - the endpoint the group's own page reads - so personal-scope sections return the viewer's own rows, gated sections return none, and a group the viewer may not see answers 404. A group whose fetch fails contributes nothing and raises no banner: the entry's own notes are the page's subject. The rows are fetched once per group and are not refetched after a mutation on the entry; nothing on the entry page writes them. | `NotesProvider` |
| **Empty sections.** A section with no rows of its own but some of its groups' counts them: its card and its group card open rather than collapse (the count badge shows the total), and its "No entries." hint is not drawn. Memes counts its groups' memes the same way. | `appendixCount` in `sections/ui.jsx`, `blockCount` |
| **Nothing to show.** An entry with no series or franchise, or an anime movie (no `series_id`) for the series half, shows nothing extra. | `groupOwners` in `NotesProvider` |

The plumbing is one context in `sections/ui.jsx`: the provider wraps a section
in `SectionCardProvider` with an `appendix` (the `GroupNotes` sub-lists) and an
`appendixCount`; `SectionCard` draws the appendix after the section's own body
and adds the count, and a group's own render is wrapped in a `bare` provider so
its `SectionCard` draws its rows and nothing else. No shape component knows
about it. The notes page fetches through `pages/notes/api.js` rather than
TanStack Query - it has never used a query hook - so the group rows do too.

### Section components (`frontend/src/pages/notes/sections/`)

| Component | Shape | Fields it shows |
| --- | --- | --- |
| `TextSection.jsx` | text | content |
| `TextLinksSection.jsx` | text_links | locator (only if the section has a `locator_placeholder`), content, links; enforces `desc_required` / `locator_required` client-side. On a section serving `move_targets` (the 待辦 buckets), each row also carries a native "Move to…" `<select>` beside Edit and Delete, shown to whoever may edit the row; picking a target calls `onUpdate(id, {section})`. On a `kind_is_group` section (彩蛋) the form opens with an optional Group whose `datalist` offers the owner's own groups and the section's `kind_category` values, and the card draws one heading per group exactly as `NameLinksSection` does — both read `kindGroups.jsx`. |
| `EpisodeTextSection.jsx` | episode_text | locator, kind dropdown when `kinds` non-empty, content, and links when the section `takes_links` — the same `LinkPairsEditor` and `LinkPairPills` as `TextLinksSection`, sent as titled links with URL-less ones dropped; a section without the flag sends no `links` key |
| `NameLinksSection.jsx` | name_links | on a `kind_is_group` section an optional Group first (a `datalist` over the groups this owner's rows already use, through `kindGroups.jsx`), then the title - placeheld "Description (optional)" - and links. Once any row has a group the card draws one heading per group, in the order each first appears among the rows, and the ungrouped rows last under "Other"; rows are folded and reordered in that drawn order, so dragging a row above another group's first row moves its group up. With no row grouped the list is plain. |
| `NameEntriesSection.jsx` | name_entries | title, kind dropdown when `kinds` non-empty, and the ordered `entries` array (each item a line of text or a labelled link, dragged into order in the form by its grip). No section uses it. The shape, the column, the component and the Sheets parsing all stay — rows written in it are still in the database and still have to Pull. |
| `StructuredSection.jsx` | structured | whatever `section.fields` declares — it is the only component here that does not know its own fields. Also owns drag-to-reorder (a grip per row from `components/ui/Sortable.jsx`; each drop is one `PATCH /api/notes/reorder`, applied on screen at once by `NotesContext`, with that section's grips disabled until the save settles), the inline `quick_edit` input, and, for a `hierarchical` section, the tree: an Add button per row that opens a draft carrying that row's id as `parent_id`, children indented behind a rule, and a move — among a row's own siblings, never to another parent — that flattens the whole tree depth-first. A free-text `select` naming an `option_category` renders as a `SuggestInput` over that category's values (`optionValues`, handed in by `NotesContext`) and stays free text; a `text` field naming `suggest_from` does the same over the names of the owner's rows in that section (`sectionTitles`). A `names` field renders as `NamesInput.jsx` in the form and as tags in the row, suggesting `sectionTitles` for its `suggest_from` where it names one and the cast otherwise. A `choice_node` field renders as `ChoiceNodeSelect` in the form (the owner game's blocks, grouped Start / Part / Ending, plus "Unknown block" for a link the list does not hold) and as a tag reading "At node: {title}" in the row (`ChoiceNodeName`), both from `components/game-choices/ChoiceNodeField.jsx`; the owner's id reaches them through a context the component sets from its `ownerId` prop, rather than through every form and row. A section with `group_by` (and not hierarchical) reads as groups instead of one list (`GroupedRows`, rules in `groupedRows.js`): each group header carries a grip (drag, or ArrowUp / ArrowDown on it), and the rows are not movable there; a **Group by** toggle in the card header switches to the flat list, where they are. A section with `groupable_by` gets a toggle in its card header that switches between that grouped view (one group per `select` value) and the flat list; there both the groups and the rows within a group carry grips — a row moves only within its own group — and every move sends the section's whole row order, grouped. A section both `hierarchical` and `groupable_by` (地理 Geography) groups its top-level rows instead, each drawn with its subtree (`groupRoots`), and its form leaves the group field out for a child draft or a child being edited. **The entry cap** counts top-level rows only - a shown row shows every child - and keeps a row on screen while it or anything under it is being edited or having a child drafted; a row's grip moves it by its place among all its siblings, folded or not, so the last row shown can still be moved down past the fold, and a move that carries a row past the cap unfolds the section so the row does not vanish. A grouped section is capped twice: **per group**, each group with its own toggle, and **by group** - the first three groups show (the nameless one counting last) and the rest fold behind "Show all groups (N)" / "Show fewer groups", the same three as the row cap. A group holding the row being edited or added under stays on screen, and a group's grip moves it by its place among all the groups, folded or not, so the last group shown can be moved down past the fold, which unfolds them. A section of three groups or fewer has no group toggle. Every grouped view folds this way - `group_by`, `groupable_by` and a grouped tree. |
| `NamesInput.jsx` | — | the `names` input: chosen names as removable tags, a combobox suggesting its `suggestions` (the cast, `nameSuggestions`, or a `suggest_from` section's names) filtered by what is typed, any other text accepted - on Enter (read through `hooks/useEnterToAdd.js`), a comma, blur, or the `Add "<name>"` row while the text is not a suggestion |
| `groupedRows.js` | — | pure: `groupNotes` (one group per name, a row under every name it carries, stored order first then first appearance, a trailing unnamed group only when a row names nobody), `movedGroupOrder`, `groupedIds`, `movedRow(groups, gi, from, to)` (a row taken out and put back at `to` within its own group, as a drop does), `namesOf`; and for a grouped tree, `groupRoots` (the roots grouped by a column, first appearance, ungrouped last), `treeIds` and `movedTreeIds` (every id depth-first in drawn order, with one sibling list's move applied) |
| `MusicTrackSection.jsx` | music_track | all four song lists: title, Song Type (`kind`, a `SuggestInput` over the `kind_category` values, only where the section has one, starting on `default_kind`), episode (`locator`), link pairs (`LinkPairsEditor`, labels suggested from `link_text_category`), content. Each song's status is not in the form: it is the viewer's own, a select on the row for a viewer holding `self.personal_notes` and the `music_status` feature (`canMark`), a tag for anyone else. The list's own status sits in the card header the same way: a select over `type_statuses` for that viewer, a tag for anyone else, reading the viewer's status on the `music_status` row for this section's key (the provider's `typeStatusNote`) or `type_status_default`. Both write through `PUT /api/notes/{id}/mark` with the key `status`; a list with no `music_status` row has nothing to mark and reads its default as a tag. |
| `LinkPairs.jsx` (+ `linkPairValues.js`) | — | `LinkPairsEditor` (repeatable optional title + URL, the title a `SuggestInput` when given `textOptions`) and `LinkPairPills` (pills labelled with the link's title, else the host): the one link editor and read view of every section - `TextLinksSection`, `NameLinksSection`, `EpisodeTextSection`, `MusicTrackSection` and every `links` field of `StructuredSection` |
| `QuoteSection.jsx` / `MemeSection.jsx` | external | adapt the long-lived quote/meme components; report counts. `MemeSection.jsx` also exports `GroupMemeRows`, the read-only memes of an entry's series and franchise |
| `ui.jsx` | — | `GroupCard`, `SectionCard` (and `SectionCardProvider`, which plugs a series' and franchise's read-only rows into it - see above), `ItemActions`, `useCollapsed`, the entry cap (`VISIBLE_ENTRIES`, `capEntries`, `useEntryCap`, `ShowAllToggle`), `DraftPopup` (the new-row form's non-modal panel), `PersonalBadge` (see below), shared classes |

### Remark as a note

| Piece | Where |
| --- | --- |
| The owner tables have no `remark` column (`alembic/versions/r1e2m3a4r5k6_remark_column_to_note.py` moved it into `note`), nor do the five entity tables (`e1n2tremark3`). An owner's remarks are its `remark` note rows. | migration |
| Nothing puts a `remark` on an entry, a group or an entity: their schemas declare none, their responses carry none, and a `remark` key in a create, update or patch body is ignored. Every remark is written on the notes page, through the notes API. | `app/schemas/*`, `app/routers/_factory.py`, `collection.py`, `franchise.py`, `series.py` |
| The review queue (`find_all_remarks`) reads `note` directly and lists each entry once, with every one of its remarks in the notes page's order. | `app/services/domain/remarks.py` |

## Sheets

The Google Sheets backup has a **"Note" tab** (`SheetTab("Note", models.Note, f.parse_note_from_sheet)` in `app/services/pipelines/tabs.py`).

| Aspect | Detail |
| --- | --- |
| Columns | `note` column declaration order: `system_id, media_id, collection_id, franchise_id, series_id, studio_id, publisher_id, person_id, character_id, identity_id, section, personal, parent_id, locator, kind, status, title, content, links, entries, fields, sort_index, created_at, updated_at`, then `username` (`format_model_for_sheet`, `app/utils/formatter.py`). `author_id` is dropped for `username`, the author's name, because the uuid is minted per database; Pull resolves the name back, and an unknown, blank or absent one files the row under the installation owner. A sheet written before the column existed carries `author_id`, and Pull tries that uuid first. `links`, `entries` and `fields` are serialised as JSON text. `owner_type` / `owner_id` are **not** columns — they are read-only properties, which is what keeps them out of the sheet row. |
| Restore order | Near the end of `SHEET_TABS`: after every owner tab, Quote and Meme, before Seasonal — owners must exist first. |
| Parser | `parse_note_from_sheet` (`app/utils/formatter.py`): `owner_id` becomes None rather than failing if unparseable (no name-resolution step exists for it); the pre-rename `episode` header is still accepted as `locator` so old backups Pull. **`entries` and `fields` are each parsed exactly like `links` beside them, and `parent_id` like the owner columns** — without those keys Backup would still write the columns (the formatter walks real columns) and Pull would drop them, losing every item of every `name_entries` row, every structured field, and the nesting of every hierarchical row on a round trip. A `section` naming a key that has left the registry, or was renamed, is filed where the migration filed the local rows (`_RETIRED_NOTE_SECTIONS`): `reviews_and_comments` becomes `public_reviews`, and `remark_list` becomes `personal_notes`. |
| Id-less row matching | Pull (`app/services/pipelines/pull.py`, "Note" branch) matches on `owner_type + owner_id + section + content` — not guarded on content, so a blank-content row matches `IS NULL` instead of duplicating every pull. |
| Personal rows | A row whose `personal` is true restores as a personal row under its author, by `username`, as a personal section's rows do. A blank cell reads false. A backup taken before the column existed has no `personal` header, and every row it holds restores as catalogue, the column's default. A personal row is never retargeted at a local twin by content (`_match_note_twin` matches catalogue rows only, on both sides): it is never minted per database. |
| Remark rows | `remark` is a list, so a sheet `remark` row whose `system_id` is unknown locally is matched like any catalogue row (its twin by owner, section and content) and otherwise inserted beside the owner's other remarks. |
| Music status rows | The same retargeting per `(owner, kind)`: a sheet `music_status` row folds onto the local row for the same anime and list, keeping the local id. Its revision minted those rows separately on every database, so the two machines' copies differ in id and nothing else. |
| Personal values in an old backup | A Note tab written before the personal values moved to marks carries them on the row — the status column, or `fields.my_value`. Pull takes them off the row before matching it (the matches compare content, and the local row no longer carries them) and files them under the installation owner's mark for the row it lands on (`pop_legacy_note_values`, through `app/services/domain/legacy_personal.py`). Exact, not a guess: on those sections that column or key only ever held the personal value, and a current backup carries it null. |
| Note Mark tab | Each account's marks travel on their own tab, after Note: `note_mark`'s columns with `user_id` dropped for `username`, `values` as JSON text. Pull resolves the name (unknown → the row is skipped and reported; no header → the installation owner), matches an existing mark by `(user, note)`, and translates a `note_id` this database does not hold through the Note tab — a `music_status` row by owner and list, any other by its twin — so a mark follows a row each database minted under its own id. A cell holding no value is not restored. |
| Old-shape music rows | A sheet `ost` row carrying a type is the one-row OST of a backup taken before the OST became a song list (an OST song never has a type); it becomes the anime's `music_status` row for `ost`, keeping its status if it is one of `MUSIC_STATUSES`. Links that arrive as URL strings - any section, from a backup taken before every link was titled - are read as links with no title (`_note_links` in `app/utils/formatter.py`). A `fields` blob on a section that is not `structured` is dropped (`_note_fields`), since every other shape refuses one on the row's next edit. |
| Old-shape note rows | A sheet backed up before 操作 Controls, 職業 Classes, 地理 Geography and 各集評論 lost their links, 主線劇情 and 支線劇情 their description, 角色劇情 became titled links and 小知識 became structured is reshaped on Pull exactly as revision `n1l2inkpairs3` reshaped the local rows (`_reshape_pulled_note` in `app/utils/formatter.py`), so no pulled row keeps a value in a column its section no longer draws: links become lines of the description; a plot row's description becomes its chapter and the old chapter its first link's title (otherwise the description is appended to the chapter after " — "); an arc's text becomes its first link's title, or moves to 其他 Other prefixed "【角色劇情】 " when it has no link; a trivia row's stray locator becomes its title. Each step is a no-op on a row already in the new shape, so a newer sheet pulls unchanged. |
| Round-trip | The owner tables have no `remark` column, so **remarks round-trip only via the Note tab**. An entity tab (Studio, Publisher, Person, Character, Character Identity) from a backup that still carries a `remark` header is read rather than refused: each non-blank cell becomes a Remark row of that entity when the entity's Remark list is still empty - see [../data-actions.md](../data-actions.md). The `remark` still parsed on Order tabs is those tables' own column, unrelated. |

## Related

- [../data-actions.md](../data-actions.md) — the Note Mark tab among the others.
- History: the original spec's `unread` section is gone. `op`, `ed`, `insert_songs`, `ost` (migration `m1u2s3i4c5t6_music_notes.py`, seeded from the old `anime.op/ed/insert_ost` columns) and the four groups (`reviews`, `analysis_group`, `music`, `quotes_memes`) were added; a `music_track`-shaped `insert` section was folded into `insert_songs` by `i1n2s3e4r5t6_drop_insert_music_section.py`. The table itself came from `note_add_table.py`; `episode` → `locator` by `l1o2c3a4t5o6`.
- `../data-model.md` (Note section) — column-level remarks, partly overlapping this page.
- `docs/api.md`, `../frontend/pages.md`, `../frontend/components.md` — older, partly stale; this page wins where they differ.
- RBAC: `app/services/rbac/field_groups.py`, `field_gate.py`, `enforcement.py`.
- Quotes and memes: `app/models/quote.py`, `app/models/meme.py`, their routers, and `app/utils/media_resolver.py` for owner resolution.
- Tests: `frontend/src/pages/notes/NotesTemplate.test.jsx`, `sections/*.test.jsx`, and the backend note tests under `tests/`.
