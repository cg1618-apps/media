# Character identities — design

## Purpose

A character can go by more than one identity — Kudo Shinichi and Edogawa
Conan, a hero and their civilian name, a disguise. Today the only way to record
that is two unrelated `character` rows, or a free-text `voice.remark` such as
"child". This feature makes the extra identities first-class: each has its own
names, gender, remark and cover image, and an entry's cast can say which
identity appeared, with that identity's own cover image, remark and seiyuu.

All identities are **one character**. MAL agrees — it has one character, not
one per identity — and so do search, tags and the role derivation.

## Decisions taken in brainstorming

| # | Decision |
|---|---|
| D1 | The `character` row **is** the main identity. Only the *other* identities get a table. |
| D2 | An identity carries names, `display_name_field`, gender, remark, cover image, position. No tags, no rating, no role, no MAL fields. |
| D3 | `gender` NULL on an identity means "same as the character", resolved on read rather than copied. |
| D4 | A cast row may name an identity; NULL means the main identity. One character may have several cast rows in one entry, one per identity, each with its own role, photo, remark and seiyuu. |
| D5 | MAL import touches characters only, i.e. the main identity. Identities are never imported, matched or created from MAL. |
| D6 | Identities have their own Add / Modify / Delete admin tabs. Add **requires** choosing the existing parent character. |
| D7 | Deleting an identity folds its cast rows into the main identity (re-pointed, or merged into the main identity's row in the same entry). |
| D8 | In the cast editor each row has two fields: **Character** (searches and creates characters only) and **Identity** (optional, lists and creates identities of the chosen character only). No combined picker, no kind badge. |
| D9 | Character searches outside the admin tabs and the cast editor's Character field match identity names, and a hit resolves to the owning character. |
| D10 | The character library shows each identity as its own card, labelled with its character; clicking it opens the character's page with that identity highlighted. |
| D11 | Library filters: show/hide identity cards; characters with / without identities. Identity cards are filtered by their character's tags. |

## Data model

### `character_identity` (new)

| Column | Type | Notes |
|---|---|---|
| `system_id` | UUID PK | |
| `character_id` | UUID FK → `character.system_id`, `ON DELETE CASCADE`, NOT NULL, indexed | |
| `name_en`, `name_cn`, `name_jp`, `name_alt` | String NULL | `ck_character_identity_has_a_name`: `num_nonnulls(...) >= 1`, mirroring `ck_character_has_a_name` |
| `display_name_field` | String NULL | same vocabulary and resolution as `character.display_name_field` |
| `gender` | String NULL | `constants.GENDERS`; NULL = inherit the character's |
| `remark` | Text NULL | |
| `photo_file`, `photo_focus` | String NULL | key under `static/covers/character_identity/` |
| `position` | Integer NOT NULL default 0 | order on the character page |
| `created_at`, `updated_at` | DateTime | `get_taipei_now`, as `character` |

No `public_id`: an identity has no page of its own (D10) — its URL is the
character's with an anchor. Names are not unique, matching `character`.

`Character.identities` relationship ordered by `position`, `cascade="all,
delete-orphan", passive_deletes=True`.

Visibility is the character's: an identity is visible exactly when its
character passes `apply_shared_visibility`. No separate rule.

### `character_casting.identity_id` (new column)

- `identity_id` UUID NULL. **No `ON DELETE` action is relied on**: identity
  deletion folds rows first (see "Deleting an identity"), so any path that
  skips the fold fails loudly rather than orphaning or cascading cast history.
- `uq_character_casting` becomes `(character_id, identity_id, media_type,
  entry_id)` **`NULLS NOT DISTINCT`**, so the main identity still appears at
  most once per entry.
- Integrity: an identity must belong to the row's character. Enforced with a
  composite FK `(identity_id, character_id) → character_identity(system_id,
  character_id)` backed by `uq_character_identity_owner (system_id,
  character_id)`; a NULL `identity_id` satisfies it (MATCH SIMPLE). This
  replaces the plain FK above — one constraint, not two. It is `ON DELETE NO
  ACTION` (the fold must run first) and `ON UPDATE CASCADE`, so character
  merge can re-parent an identity and its cast rows follow in the same
  statement.
- `character_casting_voice` is unchanged: it hangs off the casting row, so each
  identity row already has its own seiyuu list.

### Cover image

- `image_manager.COVER_OWNERS`, `images.ATTACHABLE_OWNERS`, `MIRROR_COLUMNS`,
  `FOCUS_COLUMNS` and `_ENTITY_MODELS` gain `character_identity` →
  `CharacterIdentity`, `photo_file` / `photo_focus`. Each set is edited
  explicitly; they are deliberately not one set (see the comment on
  `ATTACHABLE_OWNERS`).
- Cast-row photo resolution: `casting.photo_file` → identity `photo_file` (when
  the row names one) → character `display_photo_file`.
- The identity's own displayed photo: its `photo_file`, else the character's
  `display_photo_file`. No per-identity entry fallback in this round.

### Migration

One Alembic revision on the current head (re-read `alembic heads` when the plan
executes it, not from this document). Creates the table, adds the column,
swaps the unique constraint, adds the composite FK. No data migration: every
existing cast row is the main identity.

## Behaviour

### API

- `/api/character-identity` — `GET /` (optional `character_id`, `name`),
  `GET /{id}`, `POST /`, `PUT /{id}`, `PATCH /{id}`, `DELETE /{id}?castings=N`.
  `character_id` is required on create and is **not** changeable afterwards —
  moving an identity between characters is out of scope. Gated by
  `require_manage_catalog`, as character writes are.
- `CharacterResponse` gains `identities: [IdentityResponse]` (ordered), so the
  library builds identity cards from the one list response it already loads.
  `IdentityResponse` carries `gender` raw and `display_gender` resolved.
- `GET /api/character/?name=` (the cast editor's search) stays characters only
  (D8). The library searches client-side and gets identity names from the
  nested list (D9).
- Casting row payloads (`casting_rows`, `PUT /api/casting/...`) gain
  `identity_id` and a read-only `identity_name`. `_validate_rows` rejects an
  identity that does not belong to the row's character, and a duplicate
  `(character_id, identity_id)` within one entry, with 422 before the database
  does.
- `GET /api/character/{id}/entries` returns `identity_id` / `identity_name` per
  appearance.

### Deleting an identity (D7)

`DELETE /api/character-identity/{id}?castings=N`, with `N` the cast-row count
the confirmation showed; a mismatch is 409, as character delete. Then, per cast
row naming the identity:

- the character's main identity has **no** row in that entry → set
  `identity_id = NULL`; the row keeps its role, photo, remark and seiyuu;
- it **has** one → fill the main row's blanks from the identity's row and union
  the seiyuu, using the same helper character merge uses (`fill_blank_casting`
  and the voice union), then delete the identity's row.

All in one transaction, then delete the identity.

### Character merge

The losing character's identities are re-parented onto the survivor. Casting
rows are matched on `(identity_id, media_type, entry_id)` instead of
`(media_type, entry_id)`; everything else in the merge is unchanged.

### Cast import from a franchise sibling, and MAL

- Sibling import copies `identity_id` verbatim — identities belong to the
  global character, so the id is valid in any entry. The editor's "already
  held" check keys on `(character_id, identity_id)`.
- MAL cast import creates and matches characters only and always writes
  `identity_id = NULL` (D5). A MAL character already cast in the entry under
  its main identity is "already held"; identity rows are never touched.

### Role derivation

`fill_character_roles` still reads every casting of the character, identity
rows included — they are the same character.

### Google Sheets

- New tab **"Character Identity"** (name in `tabs.py`), placed after
  "Character" and before "Character Casting", carrying every column above.
- "Character Casting" gains an `identity_id` column. Pull restores it; a sheet
  without the column (older backup) restores NULL.

## Frontend

### Admin tabs

- **Add Identity**: a required character picker (searches characters), then
  names, gender (with an "inherit from character" empty choice showing the
  inherited value), remark, cover image. The cover is attached after create, as
  for characters.
- **Modify Identity**: search identities (shows "identity of X"), edit the same
  fields; the character is shown, not editable.
- **Delete Identity**: search identities, show the cast-row count and that rows
  fold into the main identity, confirm with the count.
- Character tabs keep searching characters only.
- Placed beside the Character tabs in `Add.jsx` / `Modify.jsx` / `Delete.jsx`,
  using the same permission as the Character tabs, in both permission surfaces
  (`App.jsx` routes and `config/navigation.js`) where the Character tabs appear.

### Cast editor (`CastEditor.jsx`)

Each row: **Character** field as today (characters only, "Create new character
named X"), then an **Identity** field — empty means main identity; disabled
until a character is chosen; lists that character's identities; offers "Create
new identity named X" which POSTs with the row's `character_id`. Changing the
row's character clears its identity. Photo, role, remark and seiyuu stay per
row.

### Entry cast list (`CastSection.jsx`)

A row naming an identity shows the identity's display name as the headline with
the character's name beneath it, the resolved photo, and that row's seiyuu with
their remarks. Collapsing to Main/Core uses the row's role, as today.

### Character page (`detail/Character.jsx`)

- An **Identities** section after the profile: one card per identity with
  photo, names, resolved gender and remark; each card has an anchor
  (`#identity-<system_id>`). Arriving with that hash scrolls to and highlights
  the card.
- The appearances list shows, per entry, each cast row's identity (or the main
  identity's name) with that row's seiyuu.

### Character library (`library/CharacterLibrary.jsx`)

- The list flattens each character into its card plus one card per identity.
  An identity card shows the identity's resolved photo and display name and an
  "identity of X" line, and links to `/character/<public_id>/<slug>#identity-<id>`.
- Search matches a character card on the character's or any of its identities'
  names, and an identity card on its own or its character's names — all one
  character (D9).
- New filters in `characterFilterDefs`: **Identity cards** (show / hide) and
  **Has identities** (yes / no; applies to character cards). Tag filters apply
  to an identity card through its character's tags (D11). The count line counts
  cards.

## Tests

Backend (`tests/api/`):
- identity CRUD; create requires an existing character; the name check; gender
  inheritance in `display_gender`.
- casting PUT: identity of another character → 422; duplicate identity in one
  entry → 422; main + identity rows in one entry → accepted.
- delete folding: re-point when the main identity is absent; merge with voice
  union when present; stale count → 409. The fold test must have the main row
  present *and* hold a distinct seiyuu on each row, so the union has something
  to prove.
- character merge re-parents identities and matches castings per identity.
- photo fallback order on a cast row.
- Sheets: Backup/Pull round-trips identities and `identity_id`; a casting tab
  without the column restores NULL.
- `test_migrations_build_the_schema.py` covers the new revision from zero.

Frontend (vitest): the cast editor's Identity field (disabled without a
character, cleared on character change, create posts the character id); the
library's identity cards and both new filters; the Identity Add tab refuses
submit without a character.

## Docs to update in the implementation

`data-model.md` (new table, new column, constraint), `api.md`
(`/api/character-identity`, casting and character response changes),
`systems/credits-and-tags.md` (identities, photo fallback, merge, delete fold),
`data-actions.md` and `external-apis.md` (Sheets tab; MAL ignores identities),
`frontend/pages.md` (library, character page, admin tabs),
`frontend/components.md` (CastEditor, CastSection), `notes/decisions.md`
(D1–D11 with their reasons), `README.md` index if a page is added.

## Out of scope

Identity tags; moving an identity to another character; converting an existing
character into an identity; per-identity rating or role; identities in the
site-wide search (characters are not in it today); per-identity entry photo
fallback.
