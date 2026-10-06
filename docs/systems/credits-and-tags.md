# Credits and tags (people, studios, vocabulary links)

Last verified: 2026-10-06

## What this is for

A credit or a tag is a **row**, never a comma-joined string in a column. The
alternative — `anime.studio = "MAPPA, Studio 4°C"` — makes two spellings of one
studio into two studios, makes renaming an edit of every row, and gives a
studio nowhere to hold a profile.

Three entity tables (`person`, `person_role`, `studio`, `publisher`,
`publisher_scope`) and two link tables (`media_credit`, `media_tag`, both
addressing an entry through a real `media_id` foreign key) hold it, while every
public page, the Add/Modify forms and the Google Sheets tabs read the **same
legacy column names** — so `studio` is still a header and still a field on a
form. If you need to know where a name on an entry comes from, how it is
matched to an existing row, or why the sheet header is `music` but the role is
`composer`, this is the file.

Related: [options.md](../options.md) (the Tier 2 `system_option` vocabulary
`media_tag` points at), [data-model.md](../data-model.md),
[data-actions.md](../data-actions.md) (Backup/Pull carry the links),
[authorization.md](../authorization.md) (credit counts are viewer-filtered).

## Tables

| Table | Purpose | Key constraints |
|---|---|---|
| `person` | One human credited anywhere, and a public entity: four optional names (`name_en`, `name_cn`, `name_jp`, `name_alt`) with `display_name_field` choosing which is shown, plus `gender` (`GENDERS`), `my_rating` (`MY_RATINGS`), `photo_file` (storage key), `photo_fallback_entry_id` (see [Photo fallback](#photo-fallback)), `remark`, timestamps. Same name shape as `studio`. `gender` sits on the base table on purpose — it is a fact about the person, not a seiyuu-only attribute. | `uq_person_name (name_en, name_cn, name_jp, name_alt)` **NULLS NOT DISTINCT**; `ck_person_has_a_name` (at least one name) |
| `person_membership` | One artist belonging to one club (a person holding the `club` role): `member_id`, `club_id` (both FK `person`, cascade), `position` (the member's place in the club's list), `created_at`. That the club end holds the `club` role is checked by the API, not the database. | `uq_person_membership (member_id, club_id)`; `ck_person_membership_not_self` |
| `person_role` | Which dropdowns a person appears in: `person_id` (FK, cascade), `role` (one of `PERSON_ROLES`), `scope` (**NOT NULL**, a hyphenated media-type key, one of `legal_scopes(role)`). Explicit, not derived from credits, so a new director can be offered before their first credit. A person's visibility is the union of their rows; there is no "offered everywhere" state — see [options.md](../options.md) for why this differs from option scope. | `uq_person_role (person_id, role, scope)` (plain — no nullable column left in the key) |
| `studio` | One **anime** production studio only, and a public entity: four optional names (`name_en`, `name_cn`, `name_jp`, `name_alt`) with `display_name_field` choosing which is shown, plus `my_rating`, `logo_file`, `remark`, `founded_date`, `defunct_date`, `country`, `website_url`, `mal_id`, `mal_link`. Publishers and distributors are **not** here — they are their own `publisher` table (next row), not a vocabulary. Studios deliberately carry **no** scope table, unlike publishers. | `uq_studio_name (name_en, name_cn, name_jp, name_alt)` NULLS NOT DISTINCT; `ck_studio_has_a_name` (at least one name); ISO-8601 CHECKs on both dates |
| `publisher` | One publisher or distributor — a games publisher, or a TW licensor — and a public entity. Deliberately shaped after `studio`: the same four optional names with `display_name_field`, plus `my_rating`, `logo_file`, `remark`, `founded_date`, `defunct_date`, `country`, `website_url`. **No `mal_id` / `mal_link`**: MAL has no record of a games publisher or a Taiwanese distributor, so there is nothing to autofill from. A separate table rather than a `publisher` role pointing at `studio`, because most publisher/distributor values are distributors (木棉花, 曼迪) that never developed anything, and listing them on `/library/studio` would blur what that page means. Bandai Namco and Kadokawa, which do both, exist as two unlinked rows — accepted cost. | `uq_publisher_name (name_en, name_cn, name_jp, name_alt)` NULLS NOT DISTINCT; `ck_publisher_has_a_name` (at least one name); `ck_publisher_founded_date` / `ck_publisher_defunct_date` ISO-8601 |
| `publisher_scope` | Which media types a publisher is offered on: `publisher_id` (FK, cascade), `scope` (**NOT NULL**, a hyphenated media-type key, one of `legal_scopes("publisher")`). Explicit rather than derived from credits, for `person_role`'s reason — a distributor added today must appear in the anime picker before its first credit exists. **No `role` column**: a publisher holds exactly one role, so a column whose value is the constant `publisher` on every row would encode nothing. Zero rows means offered *nowhere*, which is what makes auto-scoping on write purely additive. `studio` has no counterpart — a studio list offering every studio is not wrong the way a distributor list offering 木棉花 on a game would be. | `uq_publisher_scope (publisher_id, scope)` — plain, not NULLS NOT DISTINCT: `scope` is NOT NULL, so nothing in the key is nullable |
| `media_credit` | One person, studio **or** publisher on one entry: `media_id` FK → `media.system_id` (cascade), `role` (one of `CREDIT_ROLE_KEYS`), `person_id` / `studio_id` / `publisher_id` (all three FK, cascade on delete), `position` (order of the original comma list), `remark`. Exactly one of the three is set. | `ck_media_credit_one_target` CHECK `num_nonnulls(person_id, studio_id, publisher_id) = 1`; `uq_media_credit_row (media_id, role, person_id, studio_id, publisher_id)` NULLS NOT DISTINCT; index on `media_id` |
| `media_tag` | One vocabulary value on one entry: `media_id` FK → `media.system_id` (cascade), `field` (one of `TAG_FIELD_KEYS`), `option_id` → `system_option` (cascade), `position`. Column is `field`, not `category`: one category can back several fields, one field maps to exactly one category. | `uq_media_tag_row (media_id, field, option_id)`; index on `media_id` |
| `character` | One fictional character, shaped like `person`: four optional names, `display_name_field`, `gender`, `my_rating`, `photo_file`, `photo_fallback_entry_id`, `role` (overall, `CHARACTER_ROLES`; a NULL one is filled from the castings' highest-ranked role), `remark`, timestamps. No owning franchise — see [Character and character_casting](#character-and-character_casting). | `ck_character_has_a_name` (at least one name). **No unique constraint on the names** — deliberately, see below. |
| `character_tag` | One vocabulary value on one character, `media_tag`'s twin: `character_id` FK → `character.system_id` (cascade), `field` (`appearance` or `trait`, one of `CHARACTER_TAG_FIELD_KEYS`), `option_id` → `system_option` (cascade), `position`. See [Character tags](#character-tags). | `uq_character_tag_row (character_id, field, option_id)`; index on `character_id` |
| `character_identity` | One of a character's other identities (the `character` row is the main one): `character_id` (FK, cascade), four optional names, `display_name_field`, `gender` (NULL inherits the character's), `remark`, `photo_file`, `position`. No `public_id`, tags, rating, role or MAL fields. | `ck_character_identity_has_a_name`; `uq_character_identity_owner (system_id, character_id)`, the composite FK's target |
| `character_casting` | THE cast record for one character, in one entry: FK-less `(media_type, entry_id)` pair, `character_id` (FK, cascade), `identity_id` (NULL = main identity), `role` (optional; `CHARACTER_ROLES` or NULL), `position`, `photo_file`, `remark`. Its seiyuu are `character_casting_voice` rows. No `media_credit` row for `seiyuu` ever exists alongside it. | `uq_character_casting (character_id, identity_id, media_type, entry_id)` **NULLS NOT DISTINCT**; `fk_casting_identity (identity_id, character_id)` -> `character_identity`, deferred; `uq_character_casting_entry (system_id, media_type, entry_id)`, the composite FK's target; index on `(media_type, entry_id)` |
| `character_casting_voice` | One seiyuu voicing one casting: `casting_id`, the casting's `media_type` and `entry_id` repeated, `person_id` (FK, **cascade**), `position`, `remark` (free text: `child`, `ep 13-`). A casting has zero or more. | `fk_casting_voice_casting (casting_id, media_type, entry_id)` → `character_casting (system_id, media_type, entry_id)`, cascade on delete and update; `uq_casting_voice (casting_id, person_id)`; `ck_casting_voice_scope` (only on `anime`/`anime-movie`/`hentai`); index on `(media_type, entry_id)` |

**Why NULLS NOT DISTINCT everywhere.** Postgres treats two NULLs as distinct
inside a UNIQUE constraint. `name_en` is NULL on essentially every backfilled
row, so the original `uq_person_name` was inert and duplicate people committed
cleanly (revision `n1u2l3l4s5n6d` collapsed those duplicates by repointing
credits, then recreated the constraints). Requires PostgreSQL 15+.

**FK-less entries.** No single foreign key can span eight media tables, so
nothing cascades when an entry is deleted. Every entry delete endpoint calls
`delete_links_for(db, media_type, entry_id)` (via `app/routers/_factory.py`)
to remove the entry's credit and tag rows; otherwise orphans would feed
`extract_system_options` and the duplicate checks forever.

## The vocabulary: `app/utils/credit_roles.py`

Shaped like `relation_kinds.py` — a frozen dataclass per entry, a dict keyed by
the stored value, tuple of keys for validation.

### `CREDIT_ROLES` (values of `media_credit.role`)

| key | label | target | media types |
|---|---|---|---|
| `studio` | Studio | studio | anime, anime-movie, game, h-game (its only credit), hentai |
| `publisher` | Publisher | publisher | anime, anime-movie, manga, novel, comic, game |
| `director` | Director | person | anime, anime-movie, movie, game, hentai |
| `producer` | Producer | person | anime |
| `composer` | Music / Composer | person | anime, game |
| `author` | Author | person | manga, novel, comic, h-comic |
| `illustrator` | Illustrator | person | manga, novel, comic, h-comic |
| `club` | Club | person | h-comic |
| `seiyuu` | Seiyuu 聲優 | person | anime, anime-movie, hentai |

**`club` is the circle an h-comic comes out of.** Studio-like as an idea, an
author as a schema: a `person` row, so a club and its artists live in one
table and `person_membership` can link them. Its only scope is `h-comic`, the
gated type, which is what hides a club created before its first credit from a
session that cannot see h-comic (a scope naming a gated type is a connection -
see [authorization.md](../authorization.md#shared-records)).

**`target` is a three-value axis, not a person/company boolean**: `"person"`,
`"studio"` or `"publisher"`. **Anything reading it as "studio else person" is
a latent bug** — a publisher credit reaching that `else` silently mints a
`Person`. `credits.py` dispatches through a `{target: resolver}` /
`{target: column}` pair instead, so a fourth target is a one-line change and
nothing falls through to person.

**`seiyuu` is a `CreditRole` whose credits are not stored in
`media_credit`.** `CreditRole` carries a `credited_via` field, `"media_credit"`
for every other role and `"character_casting"` for `seiyuu`. `credit_roles_for()`
filters to `credited_via == "media_credit"`, so `/api/credits` and the sheet
link-column builder never ask `media_credit` for seiyuu rows that will never
exist there — a seiyuu's actual work lives in `character_casting_voice`, under
the castings it voices, and is read through `/api/casting` instead. `seiyuu`
still counts toward `PERSON_ROLES`
(so it appears in dropdowns and on `/library/seiyuu`) and toward
`CREDIT_ROLE_KEYS`, so every `CREDIT_ROLES` / `CREDIT_ROLE_KEYS` call site
needs auditing for the same "lives in media_credit" assumption — the one
filter in `credit_roles_for()` is not assumed to catch every site. See
[Character and character_casting](#character-and-character_casting) below for
the table and the reasoning.

**One vocabulary, not two.** Credit roles and person roles are the same person
keys — six plus `seiyuu`, plus the two company keys `studio`
and `publisher` — so `media_credit.role` and `person_role.role` (where they
store rows at all) store the same strings, and `PERSON_ROLES` is `CREDIT_ROLES`
filtered to `target == "person"`, `seiyuu` included, minus both company keys. This is the one
place the two lists still hold together despite Decision A/B carving seiyuu's
storage out of `media_credit` — see the `seiyuu` row above.

**Labels are derived, not stored.** `credit_label(role, media_type)` is the
single owner of the reader-facing word: the same `author` credit reads 原作 on
a manga, Author on a novel and Writer on a comic, and `illustrator` reads 作畫 /
Illustrator / Artist / 繪師 on manga / novel / comic / h-comic. A small `{(role, media_type): label}` override map falls
back to `CreditRole.label`; nothing else in the codebase — no page, no form —
may hard-code these words.

`publisher` is the role that leans hardest on this: one vocabulary, six
reader-facing words. It reads **台灣代理商** on an anime or anime movie and
**台灣出版商** on a manga or novel — both name a *Taiwanese* licensor — while a
comic's publisher is the work's original one (Marvel), so it reads **出版商**
without the 台灣, and a game's reads **發行商**. All six types have an override,
so the role's own `"Publisher"` label is never rendered; it survives only for
admin tooling that holds no media type. "Publisher / Distributor" names the
concept in code comments and never reaches a reader.

**Retired keys**, in case you meet them in an old sheet or backup:
`manga_author_plot` and `manga_author_draw` → `author` / `illustrator` on
manga; `novel_author` / `novel_illustrator` → `author` / `illustrator` on
novel; `comic_writer` / `comic_artist` → `author` / `illustrator` on comic. The
person roles `manga_author`, `novel_author`, `novel_illustrator`,
`comic_writer` and `comic_artist` are gone the same way. Revision
`r0l1c2o3l4p5` rewrote the stored values.

**Scope is the media type.** `SCOPED_PERSON_ROLES`,
`DIRECTOR_ANIME_MEDIA_TYPES` and `director_scope_for()` are gone: every role is
scoped, and the scope is a hyphenated media-type key rather than the old
`"anime"` / `"non_anime"` pair. `legal_scopes(role)` returns the media types a
role may be held in, and both `PersonRoleIn` and the admin form read it, so a
form cannot offer — and the API cannot store — a pair like (composer, manga)
that names a credit which does not exist.

### `TAG_FIELDS` (values of `media_tag.field`)

| key | label | `system_option.category` | media types |
|---|---|---|---|
| `genre_main` | Genre Main | Genre Main | anime |
| `genre_sub` | Genre Sub | Genre Sub | anime |
| `label` | 標籤 Label | Label | anime, game |
| `quality` | Quality 品質 | Quality | anime |
| `original_source` | Original Source | Platform | tv-show, cartoon, movie, h-comic (the KR official source) |
| `exclusive_source` | Exclusive Source | Platform | anime, anime-movie |
| `serialization_platform` | Serialization Platform | Serialization Platform | manga, novel |
| `comic_imprint` | Imprint | Comic Imprint | comic |
| `comic_continuity` | Continuity | Comic Continuity | comic |
| `comic_era` | Era | Comic Era | comic |
| `comic_event` | Events | Comic Event | comic |
| `game_genre` / `game_theme` | Genre / Theme | Game Genre / Game Theme | game, h-game |
| `game_mode` / `combat_mode` / `game_platform` | Mode / Combat Mode / Platform | Game Mode / Combat Mode / Game Platform | game |
| `h_genre_plot` | Genre Plot | H Genre Plot | h-comic, h-game, hentai |
| `h_genre_appearance` | Genre Appearance | H Genre Appearance | h-comic, h-game, hentai |
| `h_genre_relation` | Genre Relation | H Genre Relation | h-comic, h-game, hentai |

The three H genre vocabularies are admin-managed and shared by the gated
types - one vocabulary per axis, not one per type; they serve gated types
alone, so a value is hidden from a session that can see none of them.
`game_genre` and `game_theme` reach h-game as well as game, filled from IGDB
the same way; because game is ungated, a value of theirs is hidden only
through its uses, like any ordinary vocabulary. No h-comic, h-game or hentai
credit or tag has a legacy sheet header, so each travels under its own key
(`illustrator`, `author`, `club`, `original_source`, `studio`, `director`,
`game_genre`, `game_theme`, `h_genre_*`).

**Hentai shares anime's studio and director.** Both roles gain the `hentai`
scope rather than a hentai-only role, so a studio credited on a mainstream
anime and on a hentai is one studio row. The shared-record rule then does the
rest: credited only on hentai, it is hidden with them; credited on an anime
too, it stays visible through that anime, with the hentai credit omitted.

`FILTER_ONLY_CATEGORIES = ("Franchise for Filter", "Reference Source")` exists
as a vocabulary but backs no field. **There is no `publisher_tw` or
`comic_publisher` TagField**: a publisher names an outside company rather than
a fact about the work, so it is a `publisher` credit on `media_credit`. The
sheet shape is unaffected — `LEGACY_SHEET_COLUMN` maps the credit back onto
the header.
`OPTION_CATEGORIES` = every TagField category, the two character tag
categories (`CHARACTER_OPTION_CATEGORIES`), the filter-only ones and the note
registry's.
Helpers: `credit_roles_for(media_type)`, `tag_fields_for(media_type)`.

### `LEGACY_SHEET_COLUMN` — the header trap

Keyed by `(media_type, key)`, **not** by key alone, because the same key can
have a different legacy header per type: the one `publisher` credit writes
under `distributor_tw` on anime and anime-movie, `publisher_tw` on manga and
novel, and `publisher` on comic and game — the headers the retired
`publisher_tw` / `comic_publisher` tags used, kept byte-identical so the sheet
never noticed the move. anime-movie's `distributor_tw` is the one genuinely new
column: that tab never carried a distributor. Other renames:
`composer → music`, manga's `author → author_plot` and `illustrator →
author_draw`, novel's `author → author` and `illustrator → illustrator`,
comic's `author → writer` and `illustrator → artist`, `comic_* → publisher /
imprint / continuity / era / events`. Because the map was already keyed by
`(media_type, key)`, the role collapse only renamed its keys: **every sheet
header is byte-identical to what it was before**, which `tests/unit/
test_credit_roles.py` asserts against a hand-written table. A pair absent from the map (movie
`source_official`, anime `label`) uses the key itself as header.
`sheet_column_for(media_type, key)` is the single accessor; the same names are
used as the entry payload attributes (below), so the API edge, the form state
and the sheets share one vocabulary.

## Name matching: `app/utils/name_normalize.py`

`name_slot_for(name, role=, scope=, novel_type=None)` decides **which** of a
person's four name columns an automatically created name lands in: `"en"` for a
name with no CJK, `"cn"` for anime staff and Chinese-rendered literary
novelists, `"jp"` otherwise. It never returns `"alt"` — that slot means "a name
that is none of these three", which only a human can assert. The rule lives in
one place because the reshape migration is not its only caller: `resolve_person`
mints a person whenever Fill/Pull, the Sheets restore or a typed dropdown value
names somebody unknown, and a name must not land in one column during the
migration and another the next day. Resolution and display do not depend on the
choice — `_find_by_name` matches on all four columns and `display_name` falls
back through all four — so only the label is at stake.

`normalize_name(raw)` = NFKC fold (full-width Latin → half-width), strip **all**
whitespace, `casefold()`. It is a comparison key only — the original spelling is
what gets stored. `split_names(raw)` splits a comma-joined cell, drops empty
fragments and de-duplicates on the normalized key, keeping the first spelling.

## Service layer: `app/services/domain/credits.py`

Every writer goes through this module — migration, `/api/credits`, Fill/Pull,
Sheets restore — so a Tenrai name and a hand-typed name land on the same row.

| Function | What it does |
|---|---|
| `find_person` / `find_studio` / `find_publisher` | Linear scan matching `normalize_name` against any of the model's `_name_fields` — all four names, for a person as for a studio or a publisher; returns the row or None, and raises `AmbiguousNameError` when several rows match. Python-side because the fold is not expressible in portable SQL and the tables are small. |
| `resolve_person(db, name, role=, scope=)` | Find-or-create, then ensure the `(role, scope)` `person_role` row exists. A newly created person's name goes into the column `name_slot_for` picks, not a fixed one. |
| `resolve_studio(db, name)` | Find-or-create. |
| `resolve_publisher(db, name, *, scope=None)` | Find-or-create, under `name_en` when new, and — when a scope is given — make sure the publisher holds a `publisher_scope` row for that media type. Additive, never subtractive, exactly like `resolve_person`: crediting a publisher on a manga can only widen where it is offered. Safe precisely because zero scope rows means "offered nowhere". `replace_credits` dispatches to it by name rather than through `_RESOLVERS`, since it takes a scope and `resolve_studio` does not. |
| `resolve_option(db, category, value, scope=None)` | Find-or-create the `system_option`; adds a scope row only when `scope` is passed explicitly (backfill seeding, admin edits) — never derived from the caller's media type. |
| `replace_credits(db, media_type, entry_id, role, names)` | Whole-set replace for one role, preserving order in `position`. The person role is scoped to the entry's own media type. Dispatches on `spec.target` through `_RESOLVERS` / `_TARGET_COLUMNS` — three explicit entries, no `else` meaning person. |
| `replace_tags(...)` | Whole-set replace for one field. Deliberately does **not** auto-scope the option to the media type: doing so once silently narrowed an unscoped "Disney+" to TV-only after one TV use. |
| `delete_links_for` | Removes all credit + tag rows of a deleted entry; returns the count. |
| `credit_names` / `tag_values` | One entry, one role/field, stored order. |
| `credits_to_sheet_value` / `tags_to_sheet_value` | `", ".join(...)` of the above. |
| `link_values_for_entries(db, media_type, ids)` | Batch read: `{entry_id: {key: [names]}}` in a **fixed five queries** regardless of entry count (the N+1 avoider). |
| `legacy_link_fields(media_type)` | `(payload_attr, "credit"/"tag", key)` triples using the legacy names. |
| `attach_link_fields(db, media_type, entries)` | Sets the legacy-named, comma-joined attributes (`studio`, `director`, `music`, `distributor_tw`, `era` …) on ORM entries in place, like `attach_plan_flag`, plus the three linkable shapes: `credit_refs` (`{role: [{system_id, display_name, label}]}`, every type), `studio_refs` (anime and anime-movie) and `publisher_refs` (any media type whose `credit_roles_for` includes `publisher` — derived, not hand-listed). Both come out of the same batched fetch, so they cost no extra query. Called from `_factory.py` on detail (one entry) and list (many) so public pages keep reading one response. These live on `*Response` schemas only, never on Create/Update bases — a write naming them is rejected, not silently stored. |
| `sheet_link_headers(media_type)` / `sheet_link_values` / `sheet_link_rows` | Sheets export: headers via `sheet_column_for`, appended at the **end** of each entry tab (restore matches by header name, not position). `sheet_link_rows` is the batched form Backup uses. |
| `names_from_sheet_value` | `split_names` alias for Pull. |
| `backfill_credits(db)` | One-time, idempotent migration body over `BACKFILL_MAP` (26 legacy columns). Reads each legacy column through `information_schema` + raw SQL, not the ORM — the models no longer define these columns, so an attribute read makes the whole backfill a silent no-op. Reports counts and an `unplaced` list rather than guessing; then runs `extract_system_options`. `manga.anime_studio` is deliberately excluded (it names the adaptation's studio — belongs in relations). |
| `verify_backfill_lossless(db)` | Compares legacy raw columns (via `information_schema`, not the ORM) against link tables as normalized sets; only names *missing* on the link side count as mismatches. The drop migration aborts on any. |

### `extract_system_options` (`app/services/domain/options_extraction.py`)

Purely additive reconcile: for every `media_tag` whose field is in `TAG_FIELDS`,
ensure a `system_option_scope (option_id, media_type)` row exists. Never removes
a scope, and never gives an unscoped option its first one - no rows means
offered on every type, so that row would narrow it. Reads existing pairs once into a set — reading them through a
relationship collection instead goes stale mid-run, adds duplicates and 500s
the first Calculate after a restore. Called by the backfill and by Calculate
All.

## Endpoints

| Method / path | Auth | Notes |
|---|---|---|
| `GET /api/credits/{media_type}/{entry_id}` | public (viewer) | `{"credits": {role: [names]}, "tags": {field: [values]}}`, only keys with rows. Unknown type → 400; missing **or hidden** entry → 404 (`entry_visible`). |
| `PUT /api/credits/{media_type}/{entry_id}` | admin | Body `{credits: {role: [..]}, tags: {field: [..]}}`. Touches only the named roles/fields; an absent key is left alone, an empty list clears. Role/field not valid for the type → 400. |
| `GET /api/person/?role=&scope=` | public | Sorted by resolved `display_name`; both filters are exact, and a query without `scope` means "holds this role in any media type". `credit_count`, `display_photo_file`, `media_types` and `restricted` are resolved from only the entries the viewer may see (`filter_visible_pairs`), for the whole list in one pass - see [Photo fallback](#photo-fallback). Each row carries every `(role, scope)` the person holds, so the admin form can load the whole set in one request. |
| `GET /api/person/role-counts` | public | `{person_role: distinct people}` incl. zeros; declared before `/{system_id}`. |
| `GET /api/person/role-scopes` | public | `{role: [legal media types]}`, derived from the same `CreditRole.media_types` that validates writes, so the admin form and the validator cannot drift. Declared before `/{system_id}`. |
| `GET /api/person/{id}/entries` | public | The entries this person is credited on, grouped by `(media_type, role)` with the derived label, filtered through the same `filter_visible_pairs` as `credit_count`. 404 when the person is hidden — every connection hidden, see [authorization.md](../authorization.md#shared-records); a visible person's credits on label-hidden entries are omitted, group and all. |
| `GET /api/person/{id}` | public | 404 if absent or hidden. |
| `POST /api/person/` | admin | **Find-or-create** on normalized name (matches `resolve_person`), then adds any missing roles; metadata of an existing person is untouched. Find-or-create because `ensureSourceValues.js` POSTs whenever a typed name is absent from a *role-filtered* list. The body carries either the four labelled name columns (the admin form) or one unslotted `name` (every other writer), which the endpoint places through `name_slot_for` — a caller holding one typed string cannot know its column, and copying the rule into the frontend would give one name two homes. |
| `PUT /api/person/{id}` | admin | Full metadata update; replaces the role set. `photo_fallback_entry_id` must name an entry the person is linked to and the editor can see (422); a null keeps a stored choice the editor cannot see. `mal_id` is derived from `mal_link`, and a person holding the `seiyuu` role is then filled from MAL, empty columns only (as `POST /` does on its create branch) - see [external-apis.md](../external-apis.md#mapping-for-person-seiyuu--map_tenrai_to_person_data). |
| `PATCH /api/person/{id}` | admin | Partial update of the person's own columns (not roles), for inline rating and remark edits. The `PUT` rules - vocabularies, at least one name, the fallback check - are checked first; server columns are a 422. A `mal_link` re-derives `mal_id`; no MAL fetch. |
| `DELETE /api/person/{id}?credits=N` | admin | Credits and voice rows cascade away — wrong fix for a duplicate; the castings those voices sat on stay (Decision H). `credits` is **required** and is the count the confirmation dialog showed — `media_credit` rows plus `character_casting_voice` rows; a mismatch is a 409, because an admin who agreed to destroy three credits did not agree to destroy the five that exist now. |
| `POST /api/person/{id}/merge` `{source_id}` | admin | Repoints every credit from source onto target (drops ones that would collide on `(media_type, entry_id, role)`), repoints every voice row (drops one on a casting the target already voices), unions `person_role` rows, moves both ends of every club membership (dropping a duplicate or a self-membership), deletes the source, then fills every column the target leaves blank from the source's (see **Merging fills blanks** below). 400 on self-merge. Returns `credits_moved`, which counts moved voices too. |
| `GET /api/person/{id}/clubs` | public | The clubs this person belongs to, as `MembershipRef` (`system_id`, `public_id`, `display_name`, `position`), ordered by name. Hidden clubs are omitted; 404 when the person is hidden. |
| `PUT /api/person/{id}/clubs` `{club_ids}` | admin | Whole-list replace. Each id must be a person the writer may see (422 otherwise) holding the `club` role (422), and not the person itself (422). A new membership joins the end of its club's list. Memberships of clubs the writer cannot see are kept. Returns the new list. |
| `GET /api/person/{id}/members` | public | A club's members in `position` order, as `MembershipRef`; hidden members are omitted, and a person who is not a club answers `[]`. 404 when the club is hidden. |
| `PUT /api/person/{id}/members` `{member_ids}` | admin | Whole-list replace, in display order (`position` = index). The person must hold the `club` role (422); each id must be a visible person and not the club (422). Members the writer cannot see keep their rows, after the visible ones. |
| `GET /api/studio/`, `GET /{id}`, `POST /`, `PUT /{id}`, `PATCH /{id}`, `DELETE /{id}`, `POST /{id}/merge` | as person | Same shape minus roles, and `POST /` is find-or-create for the same reason. The list is sorted by resolved `display_name`, and both reads carry it. `credit_count`, `media_types` and `restricted` are resolved from only the credited entries the viewer may see, from one `credits.credit_summaries` pass for the whole list. `PATCH` is the inline rating and remark edit, under the `PUT` rules (`_entity_patch.prepare_patch`). Renaming a studio changes what every credited entry shows — no propagation step. |
| `GET /api/studio/{id}/entries` | public | The reverse of `GET /api/credits/...`: the entries this studio is credited on, grouped by media type, filtered through the same `filter_visible_pairs` as `credit_count` so the two can never disagree. 404 when the studio is hidden — every credit on a label-hidden entry. |
| `GET /api/publisher/?scope=`, `GET /{id}`, `GET /{id}/entries`, `POST /`, `PUT /{id}`, `PATCH /{id}`, `DELETE /{id}`, `POST /{id}/merge` | as studio | `app/routers/publisher.py` mirrors `app/routers/studio.py` endpoint for endpoint, minus the MAL derivation and autofill (there is no MAL record to enrich a publisher from) — and minus the delete guard: `DELETE` takes no `?credits=N`, exactly as studio's does not. One deliberate divergence, below. Studio has no counterpart for the `scopes` list every publisher payload carries: `?scope=<media-type>` narrows the list to publishers offered on one type (omitted, it returns everything, including publishers holding no scope at all — the admin list page must be able to see a publisher in order to give it one); `POST` inserts scopes additively, `PUT` replaces the whole set, and merge unions both sides'. There is no `/api/publisher/role-scopes` counterpart to person's: one role means `legal_scopes("publisher")` is a constant the frontend holds. |
| `GET/POST/PUT/DELETE /api/options/...` | read public, write admin | The Tier 2 vocabulary `media_tag` points at; see [options.md](../options.md). |
| `GET /api/character/?name=` | public | Substring match, case-insensitive, across all four name columns. Sorted by resolved `display_name`. Exists so the cast editor's character combobox never downloads the whole table. |
| `GET /api/character/{id}`, `GET /{id}/entries` | public | As person/studio, but `/entries` groups only by media type (a character holds no role) and each entry carries `seiyuu`: everyone who voiced them there, in voice order, each as `{display_name, system_id, public_id, remark}` (empty when nobody did). |
| `POST /api/character/` | admin | **Plain create — not find-or-create**, unlike `POST /api/person/` and `POST /api/studio/`. See [Character and character_casting](#character-and-character_casting) for why. |
| `PUT /api/character/{id}` | admin | Full metadata update. `photo_fallback_entry_id` must name an entry the character is cast on and the editor can see (422); a null keeps a stored choice the editor cannot see. |
| `PATCH /api/character/{id}` | admin | Partial update, for inline rating and remark edits; the `PUT` rules are checked first and server columns are a 422. |
| `DELETE /api/character/{id}?castings=N` | admin | Same count-guard shape as `DELETE /api/person?credits=N`: castings cascade away, and a count that moved underneath the admin is a 409. |
| `POST /api/character/{id}/merge` `{source_id}` | admin | Repoints every casting from source onto target, deletes the source. Where both are cast on the same entry (which would collide on `uq_character_casting`), the source's casting is dropped, its voices the target's casting lacks are appended to the target's, and the target's casting fills its blank role, remark and photo from it. Then fills the target's blank columns, as person does. The correct fix for a duplicate, since a delete would cascade the castings away. |
| `GET /api/casting/{media_type}/{entry_id}` | public (viewer) | The entry's cast, ordered by `position`; each row carries `voices: [{person_id, person_public_id, person_name, remark}]` in voice order. Missing or hidden entry → 404 (`entry_visible`), exactly as `/api/credits` behaves. |
| `PUT /api/casting/{media_type}/{entry_id}` | admin | Replaces the whole cast in submitted order, each row with its `voices: [{person_id, remark?}]` in order. `media_type` is one of `CASTING_MEDIA_TYPES` (anime, anime-movie, manga, novel, h-comic, hentai). `role` is optional - null or blank stores no role. Rejects (422) voices on a non-voiced media type - h-comic included - one person twice in a row's voices, or a non-blank role outside `CHARACTER_ROLES`, before a row ever reaches `ck_casting_voice_scope` or `uq_casting_voice`. |

**Deleting a publisher removes its logo; deleting a studio does not.** This
asymmetry is deliberate, not an oversight. `delete_publisher` calls
`delete_cover_image(str(system_id))` after the row is gone;
`delete_studio` never has, so a deleted studio leaves its logo object behind
in GCS — image cleanup was only ever wired into the media-entry paths
(`app/routers/_factory.py`, `calculation.py`). Publisher does not inherit that
gap, and `tests/api/test_publisher_router.py` pins the call by monkeypatching
`delete_cover_image` on the router module. Fixing studio the same way is a
one-line change nobody has made yet; until somebody does, the two paths differ
on purpose rather than by accident.

## Duplicate entity check

`find_duplicate_entities` (`app/services/domain/checking.py`) is part of
`find_all_duplicates` under the `"entities"` key. It clusters people,
studios and publishers (each table separately) by union-find over the normalized keys of all
four name columns, since `_find_by_name` matches on any of them.
The fix it points at is the merge endpoint, never delete.

## Where credits are written

| Writer | Path |
|---|---|
| Add / Modify forms | `ensureSourceValues.js` first POSTs any typed-but-unknown value (dispatched on `source.kind`: person → `/api/person/` with the field's role **and** scope, studio → `/api/studio/`, publisher → `/api/publisher/` as `{name_en}`, option → `/api/options/`), then the form saves the entry and `PUT /api/credits/...`. |
| Fill (autofill, `app/services/domain/autofill.py`) | Movie director from TMDB, comic writer/artist from Comic Vine — only when the role has no credits yet (`credit_names` empty). Anime studio/director/producer/composer via the Tenrai fill path. |
| Pull (`app/services/pipelines/pull.py`) | Legacy headers are popped from the parsed row into `pending_credits` / `pending_tags` and applied via `replace_credits` / `replace_tags` after the entry row is upserted. |
| Backup (`app/services/pipelines/backup.py`) | Appends `sheet_link_headers` + `sheet_link_rows` to every entry tab. |
| Sheets tabs (`app/services/pipelines/tabs.py`) | Dedicated `Person`, `Person Role`, `Studio`, `Publisher` and `Publisher Scope` tabs restored **before** any media tab so credits can resolve against them. The two scope tabs matter beyond ordering: `replace_credits` re-adds a scope additively for every credited entity, so only an entity credited **nowhere** — `bilibili`, `Crunchyroll` — and a scope set ahead of its first credit depend on the tab surviving the round trip. Zero rows means offered nowhere, so losing them hides the entity in every picker. |

## Admin UI

The "System Options" nav entry has **two** sub-tabs on all three admin pages
(Add / Modify / Delete), rendered by the shared `OptionSubTabBar`: **Options**
and **Tags**. Both are the same form over the same rows — vocabulary value plus
`ScopePicker`, one endpoint — split only so the category list is shorter;
`TAG_CATEGORIES` decides which side a category falls on, see
[../options.md](../options.md). Each page filters its category `<select>`
through `categoriesForSubTab` (`frontend/src/lib/optionCategoryGroups.js`),
clearing the selected category when the half changes; Delete lists only
categories that actually hold values.

People and studios were once sub-tabs here. Both moved out to the **Entity**
tab group on Add / Modify / Delete when each became a public entity rather than
a closed vocabulary — see
[../frontend/admin-pages.md](../frontend/admin-pages.md). The Person tab adds a
`PersonSubTabBar` of the five types, which filters the list and preselects the
type for a new person but never narrows what the form edits: a person is one
row that may hold several types, so `PersonFields` always shows the full
role × scope matrix, with each type's legal media types read from
`GET /api/person/role-scopes`.

The person/studio pickers on entry forms are the standard "tags" fields whose
`source.kind` is `person` / `studio`. Both entities now have public pages —
`/library/person` and `/person/:system_id`, `/library/studio` and
`/studio/:system_id` — and every credit on a detail page links to them:
`credit_refs` through `PersonLinks.jsx`, `studio_refs` through
`StudioLinks.jsx`, each falling back to the legacy comma-joined string when the
entry carries no refs or the viewer lacks the Credits permission.

The publisher picker is the same shape (`source.kind` `publisher`) on all six
types that credit one, and its suggestion list is fetched **per media type**:
`frontend/src/lib/sources.js` requests `/api/publisher/?scope=<media-type>`
once per scope rather than one flat list, so a games publisher is never
suggested as an anime distributor. `ensureSourceValues.js` sends that scope on
the create it POSTs for a typed-in name — the POST is additive, so it can only
widen a publisher that already exists, and without it the new publisher would
be missing from the very picker that created it. The Publisher Add and Modify
tabs carry `PublisherScopePills`, a single row of media-type pills (the
`PersonRoleMatrix` shape with no role axis to cross), which is where an admin
takes a scope away. `publisher_refs` render through `publisherValue` /
`publisherLabel` in `StudioLinks.jsx`; the label comes off the ref, so no page
hard-codes 台灣代理商 or 發行商.

## Migrations

The revision-by-revision account of how these tables were built lives in
[notes/migrations-history.md](../notes/migrations-history.md); `alembic
history` is the authoritative chain.

One consequence is worth knowing here: a Sheets backup taken before the role
vocabulary was collapsed cannot be restored directly, because its `Person
Role` tab carries empty scopes and retired role names. The route back is
`alembic downgrade s1t2u3d4i5o6`, Pull, then `alembic upgrade head`.

## Character and character_casting

Four tables, and the shape is deliberate on the points recorded below.

- `character` — one fictional character, shaped like `person`: four optional
  names, `display_name_field`, `gender`, `my_rating`, `photo_file`,
  `photo_fallback_entry_id`, `role`, `remark`, and `mal_id` / `mal_link`
  (indexed, not unique - see [MAL](#mal-a-characters-link-and-a-cast-import)
  below). `role` is what the character
  is overall. While it is NULL, `fill_character_roles`
  (`app/services/domain/casting.py`) fills it with the highest-ranked
  `character_casting.role` (`CHARACTER_ROLES` order, Main first): for the
  cast's characters on every cast save, and for every character in Calculate
  All's `run_sync_character_roles`, the net under Pull and a sheet restore.
  A set role is never overwritten, so clearing one only lasts until the next
  fill while a casting still names a role; nothing flows from it to a casting. `ck_character_has_a_name` requires at
  least one name. `gender` and `my_rating` are the same closed vocabularies
  as on `person` ([options.md](../options.md)); a write outside them is a 422.
- `character_identity` — one of a character's **other** identities (an alter
  ego, a disguise, a civilian name): four optional names (at least one),
  `display_name_field`, `gender`, `remark`, `photo_file`, `position`. The
  `character` row **is** the main identity, so names, photo and remark are held
  once, and every identity is one character: search, tags, rating and the role
  derivation all stay the character's, and an identity has no tags, rating,
  role or MAL fields of its own. A NULL `gender` means *the same as the
  character's*, resolved on read (`display_gender`). Visibility is the
  character's. An identity's own picture is its `photo_file`, else the
  character's displayed one (`display_photo_file`); there is no per-identity
  entry fallback. Admin tabs create, edit and delete identities, always under an
  existing character.
- `character_casting` — THE cast record: one character, in one entry, with
  its own optional `role` (`CHARACTER_ROLES`, or NULL - a blank role from the
  cast editor or a Sheets cell is stored as NULL), `position`, `photo_file`
  and `remark`. No `media_credit` row with `role="seiyuu"` exists anywhere;
  an entry's seiyuu list is derived entirely by walking its castings' voices.
  A cast row may name one of its character's identities (`identity_id`; NULL is
  the main identity), and **one character may be cast once per identity per
  entry**: Shinichi and Conan are two rows in one entry, each with its own role,
  photo, remark and seiyuu list. The identity must be the row's character's own
  (`fk_casting_identity`, and a 422 before the database). A row's displayed
  photo falls back **row, then its identity, then `character.photo_file`**, the
  focus travelling with whichever won. `fill_character_roles` still reads every
  casting of the character, identity rows included - they are one character.
- `character_casting_voice` — one seiyuu voicing one casting, with a
  `position` and a free-text `remark` saying which voice it is (`child`,
  `ep 13-`). A character may have several seiyuu in one entry, and one seiyuu
  voicing several characters is one person on several castings.
  `uq_casting_voice` keeps a person to one voice per casting. The row repeats
  its casting's `media_type` and `entry_id`, held equal by the composite FK
  `fk_casting_voice_casting`, so "which entries does this person voice in"
  reads this one table - as `credit_count`, person `/entries`, the
  shared-record visibility rule and the photo fallback all do - and so
  `ck_casting_voice_scope` can be a CHECK.

Three shapes **deliberately rejected**, each a considered decision rather than
an oversight:

- **No franchise owner.** A nullable `character.franchise_id` is the obvious
  shape and the wrong one. A character can appear in several entries that
  need not share a franchise, and ownership cannot express that, so
  `character` is a top-level row (like `person`) and `character_casting` is
  the many-to-many (like `media_credit`).
- **No `language` column.** It would mark a voice as the JP original or a
  CN/EN dub. Deliberately deferred: the column would read "Japanese" on
  every row until the first dub is entered. A dub actor can already be
  recorded as a further voice on the casting, its remark saying so; a
  `language` column on `character_casting_voice` is a later, additive
  widening, not part of this shape.
- **`character_casting`, not `character_appearance`.**
  "Appearance" reads two ways — "appears in this anime" and "how she looks" —
  and the moment the row carries a `photo_file`, the second reading wins. Same
  ambiguity `feedback_label_vs_content_label` already tracks for "label"; the
  table name says what the row is instead: this character, in this entry,
  looking like this - and, through its voices, voiced by these people.

Two further, related design points worth knowing here:

- **No unique constraint on character names (Decision G).** `uq_person_name`
  and `uq_studio_name` work because a human's or a company's full name is
  nearly unique; character names are not — "Yuki" and "Ichika" recur across
  unrelated works — and Decision C leaves no owning franchise to scope a
  constraint to. Duplicates are caught by the cast editor's name-match search
  and fixed by `POST /api/character/{id}/merge`, not by a database
  constraint. Consequence: `POST /api/character` is a **plain create**, never
  find-or-create like `POST /api/person` — silently matching by name here
  would fuse two unrelated characters who happen to share one.
- **Deleting a seiyuu never deletes a casting (Decision H).**
  `character_casting_voice.person_id` is `CASCADE`, as
  `media_credit.person_id` is, because a voice row IS the person's link to
  the work. The casting above it is the *character's* link to the work, so
  it stays, with whatever other voices it has; the casting's `character_id`
  remains `CASCADE`. `POST /api/person/{id}/merge` repoints voice rows, so a
  duplicate seiyuu is merged without losing any.

### Character tags

A character carries two tag lists, `appearance` and `trait`
(`CHARACTER_TAG_FIELDS` in `credit_roles.py`), drawn from the `system_option`
categories `Character Appearance` and `Character Trait` and stored in
`character_tag`. They are **not** `TagField`s: `TAG_FIELDS` is keyed by entry
media types, and `gated_tag_categories`, `extract_system_options` and the
entry tabs' sheet columns all walk it. A character belongs to no media type,
so each list is one vocabulary for every character — no gated distinction, no
scopes, and no category hidden from a narrow session.

The service is `app/services/domain/character_tags.py`, the character-side
twin of `replace_tags` / `tag_values`:

- `replace_character_tags(db, character_id, field, values)` — a whole-set
  replace for one field. Values are trimmed, blanks dropped and duplicates
  (by `normalize_name`) folded onto the first; each resolves through
  `resolve_option`, so it lands on an existing value by normalized name and
  **creates** one that is missing, as entry tags do.
- `character_tag_values(db, ids)` — `{character_id: {field: [value, ...]}}`
  in stored order, an empty list for a field with none, in **one query**
  however many characters: the list endpoint and Backup read a whole table.
- `merge_character_tags(db, keep_id, drop_id)` — the survivor of a merge gets
  the union per field: its own values first, then the loser's it lacked.

The router pops both lists out of a write before the columns are set
(`pop_character_tags`; `pop_patch_tags` for a `PATCH`, whose body no schema
checked), because `_patching.apply_column_patch` silently ignores a key that is
not a column. `null` or absent leaves a list as it is; a list replaces it.

**Visibility.** A `character_tag` row is not a connection in
`shared_visibility.py`: a value used only by characters has no connection at
all and stays visible to everyone, which is right for an ungated vocabulary.

**Sheets.** The Character tab (`SheetTab.character_tags`) carries one
comma-joined cell per field, headed `appearance` and `trait`, after the plain
columns. Pull reads them from the raw row once the character exists: a present
but empty cell clears the list, and a sheet without the header leaves it as it
is. `System Options` restores before `Character`, so the cells resolve onto
the restored values; `uq_system_option_value` cannot collide with a value
`resolve_option` created, because the Character cells were written from the
stored spelling and `System Options` matches on the exact `(category, value)`.

Deferred, deliberately, past this shape: a `language` column / dub casts, a
`field_group` gating cast per role, and characters on the four non-ACG media
types.

### Identities

- **Deleting an identity folds its cast rows into the main identity**; it never
  deletes cast history (`fold_into_main`, `app/services/domain/character_identities.py`).
  A row in an entry where the main identity has no row keeps everything and its
  `identity_id` becomes NULL. Where the main identity already has a row there,
  the identity's row is absorbed into it - the main row's blanks filled from it
  and the seiyuu it lacked appended (`absorb_casting`, the same helper merge
  uses) - and then deleted. The delete takes the cast-row count the confirmation
  showed and answers 409 when it has moved.
- **Character merge carries identities.** The loser's identities are re-parented
  onto the survivor, after the survivor's own, and their cast rows move with
  them. Castings are matched per identity: only two rows of the *same* identity
  in one entry are folded together, so a main row meets a main row and an
  identity row is never matched against the survivor's.
- **MAL never writes an identity.** The cast import matches and creates
  characters only and writes `identity_id = NULL`; a MAL character already cast
  under its main identity is "already held", and identity rows are never touched.
- **Copying a cast from a franchise sibling** carries `identity_id` verbatim - an
  identity belongs to the global character, so its id is valid in any entry. The
  editor's "already held" check keys on `(character_id, identity_id)`.

### MAL: a character's link, and a cast import

**A character's MAL link.** `character.mal_link` is the character's
`myanimelist.net/character/<id>` page, and `character.mal_id` is derived from
it (`extract_mal_id_character`) on every `POST`, `PUT` and `PATCH` that
carries one. On `POST` and `PUT /api/character` a character with a `mal_id`
is then filled from Tenrai's `GET /characters/{id}/full`
(`autofill_character_from_mal`), **fill-only**: a blank `name_en` (MAL's name
in western order, "Elric, Edward" → "Edward Elric"), a blank `name_jp`
(`name_kanji`, spaces removed: `安曇 美姫` → `安曇美姫`), a blank `name_alt` (the nicknames, comma-joined), and the
portrait under `character/<system_id>.jpg` when `cover_needs_download` says
so. `about` is dropped. `PATCH` re-derives `mal_id` but never fetches. A
failure is logged and swallowed. There is no name-collision check, unlike the
person autofill: character names are not unique (Decision G).

**Merging fills blanks.** Every merge - character, person, studio,
publisher - ends in `finish_merge` (`app/services/domain/merge_fill.py`):
once the links are repointed, the loser is deleted and every column the
survivor leaves blank (`NULL` or whitespace) is filled from the loser's. A
column the survivor holds is never overwritten - it is the record the admin
chose to keep - and the ids and timestamps are never copied.

- **The picture travels whole.** A photo or logo is taken only when the
  survivor has none, and its focus comes with it, since a focus describes one
  picture. A downloaded one is stored under the loser's id
  (`<owner_type>/<loser_id>.jpg`) and `/api/covers/` checks visibility through
  the owner that id names, so it is renamed onto the survivor's own key after
  the commit - with any backfilled `image` row naming it - rather than shared.
  An upload (`library/...`) belongs to no owner and is simply shared. The
  loser's image attachments move to the survivor.
- **A casting both hold fills too.** When both characters are cast in one
  entry under the same identity, the survivor's casting keeps its own values and
  fills a blank role, remark, or photo with its focus, from the loser's (see
  [Identities](#identities)).
- **The loser goes before the fill.** Person, studio and publisher are unique
  on their four names together, and filling can give the survivor exactly the
  loser's names; deleting and flushing the loser first keeps that from
  colliding. Filled names that equal a THIRD record's are a real clash: a 409
  that changes nothing.

**Importing a cast.** `POST /api/casting/mal` (`manage.catalog`,
`app/services/domain/mal_cast.py`) takes `{media_type, mal_link,
character_ids}`. `mal_link` is the entry's own MAL page: `/anime/<id>` for anime, anime-movie and hentai, read
through Tenrai's `GET /anime/{id}/characters`; `/manga/<id>` for manga, novel
and h-comic, through `GET /manga/{id}/characters`. It returns `{cast, created_characters, created_people, warnings}`, where `cast` rows have
the shape `GET /api/casting/{media_type}/{entry_id}` returns, in MAL's order.
`character_ids` (optional, default empty) is every character the editor's
form holds, saved or not.

- **A character is matched by `character.mal_id` first**, and never by name
  across the database (Decision G), only among the characters the caller can
  see (`apply_shared_visibility`) - reusing a hidden one would put its name in
  the caller's form.
- **Within this cast, a character with no `mal_id` is matched by name.** A
  MAL row no `mal_id` matches is compared with the `character_ids` characters
  the caller can see that have no `mal_id`, so a character added to the cast
  by hand is not minted a second time. Names compare through
  `normalize_name` (width, case and spacing ignored) against `name_en`,
  `name_cn`, `name_jp` and each comma-separated `name_alt`; the MAL side
  answers to its western-order name, MAL's own "Last, First", and that order
  without the comma. Exactly one match is reused: it takes the row's
  `mal_id`, and its `mal_link` when blank, and the row carries its id, so the
  editor skips it as already held. Two or more matches are not guessed
  between: the row is dropped and named in `warnings`, and nothing is
  created for it. A held character with a `mal_id` - another one - is never
  matched by name, and nor is any character outside `character_ids`.
- **An unmatched character is created** with `name_en`, `mal_id` and
  `mal_link`; a duplicate this produces is folded by merge. Only created
  characters count in `created_characters`.
- **Only MAL's Main characters are Main; every other row is Other.** MAL's
  Supporting means "not Main", so it is not carried as Supporting - which
  side characters earn Core or Supporting is set by hand.
- **Only Japanese voice actors are taken.** MAL lists every dub; a casting
  records the original cast. Manga, novel and h-comic rows carry no voices.
- **A seiyuu is matched by `person.mal_id`, then by name** through
  `resolve_person`, the same find-or-create every other person field uses. A
  name-matched person without a `mal_id` takes MAL's (and its `mal_link` when
  blank). Every voice's person is given the `seiyuu` role scoped to the media
  type, so the editor's seiyuu list offers them. A name that matches more than
  one person (`AmbiguousNameError`) becomes a `warnings` entry and that voice
  is skipped. One person is kept once per row (`uq_casting_voice`).
- **The created characters and people are committed; the cast is not.** The
  editor appends the rows to its form, skipping characters it already holds,
  and the ordinary cast `PUT` saves them - the same rule as the franchise
  import ("Import cast from…").
- **A new character's portrait downloads after the response**
  (`download_portraits`, a FastAPI background task). The request sets its
  `photo_file` to the key the download will write; if the download fails, that
  key names a missing own download, which `cover_needs_download` treats as
  needing one, so the character's next MAL fill repairs it.
- Errors: 422 for an unknown media type or a link of the wrong kind, 502 when
  Tenrai answers with no cast. The calls share the one Tenrai rate-limit
  budget ([external-apis.md](../external-apis.md#tenrai-myanimelist)).

## Photo fallback

A character or person with no `photo_file` of its own still shows a picture:
one of the entries it is linked to stands in. The choice is made on the
server, for the viewer asking, by `app/services/domain/entity_photos.py`, and
returned as `display_photo_file` on every character and person response (list,
detail, `PUT`, `PATCH`, and the person bucket of `/api/search`).

Only entries the viewer may see are ever used - the same
`filter_visible_pairs` pass `casting_count`, `credit_count` and `/entries` go
through - so a card never shows the cover of an entry its own page would not
list.

Character, first hit wins. A casting `photo_file` is how the character looks
in that entry, so it beats the entry's cover at every step:

1. `character.photo_file`.
2. The chosen `photo_fallback_entry_id` entry's casting `photo_file`, while the
   character is cast on it and it is visible.
3. That chosen entry's cover (`media.cover_image_file`), when its casting has
   no photo.
4. The newest visible casting `photo_file` of this character.
5. The newest visible cast entry that has a cover.
6. `null`; the SPA draws its placeholder.

An **identity's** displayed photo is simpler: its own `photo_file`, else the
character's `display_photo_file` as resolved above (`display_photo_focus` with
it). A **cast row's** photo is not this chain at all - it resolves at read time
as the row's own `photo_file`, then its identity's `photo_file`, then the
character's own `photo_file`, and is never run through the entry fallbacks.

Person - a casting photo is the character's picture, not the seiyuu's, so
there are no casting steps:

1. `person.photo_file`.
2. The chosen entry's cover, while the person is credited on it or voices a
   character cast on it, and it is visible.
3. The newest visible credited or voiced entry that has a cover.
4. `null`.

The picture's focal point comes with it as `display_photo_focus`: the focus
stored beside whichever source won - the entity's own `photo_focus`, the
casting's `photo_focus`, or the entry's `media.cover_image_focus` - and
`null` when there is no picture. A focus is never borrowed from a source that
lost ([data-model.md](../data-model.md#image-focal-points)).

"Newest" is the order `/entries` uses: the entry's primary release date
(`RELEASE_PRIORITY`), descending, undated last, ties in casting or credit
position order. The chosen id has no FK, like `franchise.cover_entry_id`; one
that no longer names a visible linked entry - the entry was deleted or
un-cast, or this viewer cannot see it - falls through to step 4 (character)
or 3 (person) silently, and the response reports `photo_fallback_entry_id` as
`null` for that viewer. `PUT` and `PATCH` refuse (422) a non-null id the
record is not linked to or the editor cannot see, and a null from an editor
who cannot see the stored choice keeps it, as `PUT /api/person` keeps role
rows scoped to a hidden type.

The same pass returns `media_types` - the sorted, distinct hyphenated types of
the visible linked entries - and `restricted`, true when one of them is a
gated type. Every query in it is per page or per media type, never per row;
`tests/api/test_entity_photos.py` walks each step, proves a hidden entry's
cover is not used by reading one record as the guest and as the admin, and
counts the list's queries.

## Tests

`tests/unit/test_credit_roles.py`, `test_name_normalize.py`;
`tests/services/test_credits_service.py`, `test_credits_sheets.py`,
`test_fill_credit_resolution.py`, `test_movie_autofill_credits.py`,
`test_options_extraction.py`, `test_media_credit_model.py`,
`test_person_model.py`, `test_studio_model.py`,
`test_person_studio_uniqueness.py`; `tests/api/test_credits_router.py`,
`test_person_router.py`, `test_person_entries.py`, `test_studio_router.py`,
`test_options_router.py`, `test_entry_link_fields.py` (including the
query-count guard on `credit_refs`), `test_field_gating.py`;
`tests/unit/test_person_role_collapse.py`, `test_person_name_slots.py`;
`frontend/src/lib/ensureSourceValues.test.js`,
`src/lib/naming.test.js`, `src/components/forms/PersonSubTabBar.test.jsx`,
`src/pages/library/PersonLibrary.test.jsx`.

Character and casting: `tests/api/test_character_model.py`
(`ck_character_has_a_name`, the `display_name` fallback chain, and that no
unique constraint rejects two same-named characters — Decision G, asserted so
a future "fix" fails loudly), `test_character_casting_model.py`
(`uq_character_casting`, `ck_casting_voice_scope` rejecting a seiyuu on a
manga casting, deleting the seiyuu keeping the casting and deleting the
character removing it — Decision H), `test_casting_voices.py` (several seiyuu
on one character in order, one seiyuu on several characters, a person twice
on one row as a 422, a repeated `PUT` replacing the voices, `/entries`
listing every seiyuu, the composite FK refusing a voice that disagrees with
its casting, `ck_casting_voice_scope` on the voice table, and both merges
moving or folding voices), `test_character_router.py` (two `POST`s of the
same name create **two** characters — the API-level half of Decision G —
plus merge and the `?castings=N` 409 guard), `test_casting_router.py`
(GET/PUT wholesale replace, visibility), and the round-trip and ordering
assertions in `test_credits_sheets.py`
(`test_every_character_tab_is_registered`,
`test_character_restores_before_every_media_tab`,
`test_character_round_trips_through_the_sheet`,
`test_casting_round_trips_through_the_sheet`,
`test_a_casting_voice_round_trips_through_the_sheet`). Character tags:
`tests/api/test_character_tags.py` (both categories served and kept out of
`TAG_FIELDS`; `POST`, `PUT` replace-or-unchanged, `PATCH` writing a list and
refusing a non-list; trimming, blanks and case-folded duplicates; an existing
value reused by normalized name and a missing one created; the list in a fixed
number of queries; character and option deletes cascading; the merge union; a
characters-only value visible to a guest; and the Character tab's Backup
headers, Pull round trip, empty-cell clear and absent-column no-op). The person behaviours
that read voices are regression-tested in `test_person_router.py`
(`test_credit_count_includes_castings`,
`test_person_delete_guard_counts_castings`) and `test_person_entries.py`
(`test_a_seiyuus_entries_come_from_castings`,
`test_a_seiyuu_cast_only_on_a_hidden_entry_is_404`). The MAL link and the cast
import: `tests/api/test_character_mal.py` (the id from a link, both mappers,
Japanese voices only, the Sheet columns, the fill on `POST` and `PUT`, `PATCH`
deriving without fetching, an import creating what is missing and reusing what
is not, a second import creating nothing, a manga cast without voices, the
422 and 502, and a guest refused). Frontend:
`frontend/src/components/forms/CastEditor.test.jsx` (the seiyuu column absent
on manga/novel, a second seiyuu with its own remark, a blank seiyuu line
that adds no voice, and Import from MAL: offered only with a MAL link,
reporting what it created, and showing the server's refusal), `src/components/info/CastSection.test.jsx` (the
Main / Core / full-cast collapse, and every seiyuu of a row with its remark),
`src/pages/library/CharacterLibrary.test.jsx`,
`src/pages/detail/Character.test.jsx`, and the `role="seiyuu"` cases in
`PersonLibrary.test.jsx`.

Vocabularies, PATCH and the photo fallback:
`tests/unit/test_entity_vocab.py` (the write schemas refuse a gender or rating
outside its vocabulary, `""` is null, and a Pull folds old free text),
`tests/api/test_character_person_vocab_migration.py` (the revision's own
folding and its downgrade), `test_character_person_patch.py` (PATCH on both,
the at-least-one-name rule, server columns, non-admins refused, and the
fallback-must-be-linked check on `PUT`, `PATCH` and `POST`),
`test_entity_photos.py` ([Photo fallback](#photo-fallback)), and in
`test_casting_router.py` the optional cast role (blank or null stores no role;
an unknown role is still a 422) and the role fill (a cast save fills a
role-less character, never overwrites a held role, and Calculate takes the
highest-ranked casting role). `character.role` is covered by the same
unit file (vocabulary, blank as null, Sheets restore) and by
`test_character_person_patch.py` (POST / PUT / PATCH, and that setting it
leaves every casting's role alone).
