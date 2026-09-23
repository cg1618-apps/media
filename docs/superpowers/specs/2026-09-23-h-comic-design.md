# H-Comic — design

A tenth media type, `h-comic`: adult comics, seen in `unrestricted` mode only.
It is to manga what hentai is to anime — except that hentai is an `anime` row
carrying the `hentai` label, while h-comic gets a table of its own, because its
fields are too different from manga's to share one.

## Decisions settled with the owner

| # | Question | Answer |
|---|---|---|
| D1 | Reuse `manga`, one new type, or two new types? | **One type, `h-comic`, with `region` JP / KR.** Same pattern as manga's `region` and novel's `novel_type`: variant-dependent fields, hidden and cleared by variant. |
| D2 | Originality values | `原創`, `同人`, or null |
| D3 | Club | A studio-like idea, schema-wise an **author**: a `person` row credited under a new `club` role. Artists belong to clubs. |
| D4 | Usefulness values | `非常實用`, `實用`, `特定情況實用`, `不實用`, or null |
| D5 | Animation status | Hand-set. A link to hentai entries comes later and is out of scope. |
| D6 | Characters | Real `character` rows through `character_casting`, and **unrestricted-only** too. |
| D7 | Series number | The entry's position in its `series`, like a volume number. |
| D8 | How characters, artists and clubs stay hidden | **Derived from their appearances** (see "Visibility"). |
| D9 | Franchise | A **new franchise type `H-Comic`**. An h-comic never sits in a mainstream franchise. |

## Assumptions to confirm before the plan

- **A1 — usefulness is personal**, like `my_rating`: one person's judgement, so it
  goes on `user_media_list`.
- **A2 — chapters behind is derived.** The catalogue stores the official chapter
  count, `ch_total_official`, and the gap is `ch_total_official - ch_total`,
  where `ch_total` is what the reading source has. Neither number is typed twice.
- **A3 — animation status vocabulary** is `未動畫化`, `動畫化決定`, `已動畫化`, or
  null. The owner gave no values.
- **A4 — the official source** is the existing `original_source` tag field
  ("like cartoon"), with its scope extended to `h-comic`.
- **A5 — derived hiding keys on labels only.** An entity is hidden when every
  appearance it has is hidden *by a content label*. Media-type permission gaps
  (a guest who lacks `game`) do not hide a person, so nothing outside this
  feature changes behaviour.

## The content label

- A system label, key `h-comic`, created by a migration and by the lifespan
  seed, for the reason `seed_modes.py` gives: API tests build the schema with
  `create_all` and never run Alembic.
- **Every h-comic entry carries it, on every write path** — the form, the tracker
  PATCH, Pull, and a sheet restore. It is attached server-side in the registry
  `write_hook`, and a request that would remove it is refused (422). A missing
  label means a public entry, so this is not left to the admin.
- **Every `H-Comic` franchise carries it** through `franchise_content_label`,
  attached on auto-create and on any change to type `H-Comic`.
- **It reaches no mode except `unrestricted`**, which derives every label.
  `borderline` carries every label only as of its seed. The plan has to prove
  the h-comic label does not reach it: a test asserts that the only mode
  carrying `h-comic` is `unrestricted`.

Negative tests follow the root `CLAUDE.md` rule: the refusal tests create the
label and a labelled entry, so the hidden set is not empty. Each refusal is
paired with the mirror case, where `unrestricted` sees the same row.

## Visibility beyond the entry

The label already hides the entry everywhere `enforcement.py` reaches, including
lists, search, relations, watch orders, quotes, memes and detail pages (404).
Three things still leak a name today, and this feature closes each one.

### Characters, people (artists, authors, clubs)

These are shared records with no label. Today their pages render for everyone:
`app/routers/person.py`'s `/entries` docstring says "the person is not the
secret, their credits are". `character.py`, `studio.py` and `publisher.py`
follow the same rule.

**New rule:** a person or character is hidden from a viewer when **it has at
least one appearance and every appearance is hidden by a content label**.
Appearances are `media_credit` rows for people and `character_casting` rows
for characters. Hidden means the same thing it means for an entry:
- absent from the list and search endpoints and from every combobox
- 404 on its detail page and its `/entries`
- its photo is not served by `/api/covers`, which currently serves entity
  owners to everyone (`docs/authorization.md`, the covers row)
- notes attached to it are 404

Consequences, and why this rule was chosen over label tables:

- A Fate character cast in both Fate and a Fate-themed h-comic stays visible
  through Fate. Only the h-comic casting disappears, which is what
  `filter_visible_pairs` already does.
- Nothing needs remembering: casting a character in a normal work reveals it,
  and removing that casting hides it again.
- A record with **no** appearances stays visible, as today. That covers a newly
  created person in the admin's dropdown before the first credit is saved.
- One query shape serves both: `NOT EXISTS (a visible appearance) AND EXISTS
  (an appearance)`, built on `hidden_label_ids`.

The docstrings in `person.py` and `character.py` and the matching paragraph in
`docs/authorization.md` are rewritten to state the new rule.

### Club membership

A new table, `person_membership`:

| Column | Type | Null | Notes |
|---|---|:-:|---|
| `system_id` | UUID | no | PK |
| `member_id` | UUID | no | FK `person` CASCADE, the artist |
| `club_id` | UUID | no | FK `person` CASCADE, a person holding the `club` role |
| `position` | Integer | no | `0`, the display order |
| `created_at` | DateTime | yes | now |

UNIQUE `(member_id, club_id)`, plus CHECK `member_id <> club_id`. Membership is
not an appearance: a club with visible members but only hidden credits is still
hidden. The member list on a visible club omits hidden members.

### Series under an `H-Comic` franchise

`docs/open-items.md` lists this: there is no `series_content_label`, so a
series in a label-hidden franchise still renders its name. Every h-comic series
is in such a franchise, so this feature closes the item. Series visibility gets
the same read-time join up through `series.franchise_id` that entries already
get, and the open item is deleted in the same change.

## The table: `h_comic`

The common entry columns come from the `media` supertable, as for every type.

| Column | Type | JP | KR | Notes |
|---|---|:-:|:-:|---|
| `h_comic_name_en` / `_cn` / `_alt` | String | ✓ | ✓ | |
| `h_comic_name_jp` | String | ✓ | | |
| `h_comic_name_kr` | String | | ✓ | |
| `region` | String | | | `H_COMIC_REGIONS = ("JP", "KR")`, required |
| `originality` | String | ✓ | | `H_COMIC_ORIGINALITY = ("原創", "同人")` |
| `serialization_status` | String | ✓ | ✓ | reuses `MANGA_SERIALIZATION_STATUSES` |
| `animation_status` | String | ✓ | ✓ | `H_COMIC_ANIMATION_STATUSES` (A3) |
| `series_number` | Integer | ✓ | | Position in the series (D7) |
| `page_total` | Integer | ✓ | | |
| `ch_total` | Integer | | ✓ | Chapters at the reading source |
| `ch_total_official` | Integer | | ✓ | The official count (A2) |
| `release_date` / `end_date` | String | ✓ | ✓ | ISO CHECKs, like manga's |

Variant rule, following novel's volume-only rule: the columns a region does
not use are **cleared on every write path**, not only hidden in the form. The
cleared columns are `page_total`, `series_number` and `originality` on KR, and
`ch_total` and `ch_total_official` on JP. A name column the region does not use
is kept but not shown, since a name is harmless.

Virtual and derived fields:
- `display_name`: CN → EN → Alt → JP/KR
- `ch_behind` (KR): `ch_total_official - ch_total`, null if either is null
- the usual credit and tag link fields

**Personal columns** (`user_media_list`): `reading_status` (ReadStatus, default
`Might Read`), `my_rating` (MY_RATINGS), `completed_at`, `ch_fin` (existing
column, KR), plus two new nullable columns:
- `page_fin` (Integer, JP; default 0 in `LIST_FIELD_DEFAULTS`)
- `usefulness` (String, `H_COMIC_USEFULNESS`, A1)

### Credits and tags

| Field | Mechanism |
|---|---|
| artists | `illustrator` credit role, scope extended to `h-comic`. Label override `("illustrator", "h-comic")` → 繪師 |
| author (KR) | `author` credit role, scope extended to `h-comic` |
| club | **new** person credit role `club` (`CreditRole("club", "Club", "person", ("h-comic",))`) |
| official source (KR) | `original_source` tag field, scope extended (A4) |
| genre plot / appearance / relation | three new tag fields, `h_genre_plot`, `h_genre_appearance`, `h_genre_relation`, scoped `("h-comic",)`, with admin-managed vocabularies |
| sources | `media_source`, as every type |

The pinned sets in `tests/unit/test_credit_roles.py` (eight keys, the exact
`PERSON_ROLES`, the legal scopes) and the frontend mirrors (`fieldOptions.js`
`PERSON_ROLES` and `LEGAL`, `PersonSubTabBar`) move together.

### Notes

| Owner's note | Section |
|---|---|
| remark | `remark` (already `ALL_OWNERS`) |
| my comment | `personal_reviews` (already `ALL_OWNERS`, personal scope) |
| public comment | `public_reviews` (already `ALL_OWNERS`, catalogue scope) |
| highlights | `highlight_episodes`, owners extended to `h-comic`, label `神回`, locator `Chapter(s)` for KR and `Page(s)` for JP |
| characters | not a note: `character_casting` (D6), with `h-comic` added to `CASTING_MEDIA_TYPES`. `ck_casting_voice_scope` already rejects a seiyuu there. |

## Registration

Everything a media type touches, per the registration survey. The pinned tests
are listed so the plan knows which ones must change rather than be "fixed".

- **Hierarchy:**
  - `FranchiseType.H_COMIC = "H-Comic"`, added to `FRANCHISE_TYPES` and
    `FRANCHISE_TYPE_FOR["h-comic"]`
  - The h-comic franchise resolver matches **only** `H-Comic` franchises, so a
    name like "Fate" never attaches an h-comic to the mainstream franchise (D9)
- **Plan-next:** `ALLOWED_SCOPES` next `entry`, rewatch `entry`; flags
  `read_next` / `to_reread`; no size buckets. The module-level assert fails
  the import until this is done.
- **Watch orders:** whole-only, like manga.
- **Duplicates:** key `franchise_id`, `series_id`, `region`, `series_number`,
  plus a shared name
- **Pipelines:** `PIPELINES["h-comic"]` fetches nothing (the precedent is
  game's first spec), and it is kept out of Fill All and Replace All. There is
  no external API.
- **Sheets:** tab `H-Comic`, with a parser in `formatter.py`. It travels with
  Backup and Pull like every tab. The sheet is private, and it already holds the
  hentai rows.
- **Search:** a bucket; hidden entries are already filtered there.
- **Dashboard:** none. **Navigation:** library entry `/library/h-comic`, shown
  only when the viewer's mode carries the label, so a narrower session is not
  told the type exists.
- **Frontend:**
  - `mediaRegistry`, the library config, the detail route, `NAMING_CONFIGS`,
    colours, forms (Add, Modify, Delete)
  - the region-dependent field visibility, mirroring `novelUnits.js`
  - the full list of touch points is in the survey the plan starts from
- `tests/api/test_backfill_media_source.py:26` compares an **archived**
  migration's column list against `MEDIA_TYPE_KEYS`, so it will fail. It pins
  history, so it gets the tenth type excluded explicitly rather than the
  archived migration edited.

## Delivery

Three plans, in this order, each a PR into `dev`:

1. **Visibility groundwork**: derived entity hiding, series under a hidden
   franchise, and hidden entity photos and notes. It ships behaviour-neutral
   for data with no labels, and it can be proven against the existing `hentai`
   label before any h-comic exists.
2. **Backend type**: the migration, model, registry, label enforcement,
   credits, tags, notes, casting, Sheets and pipelines. It adds an Alembic
   revision, so its `down_revision` is checked against `alembic heads` when the
   plan is executed.
3. **Frontend**: the library, detail and forms, the region-dependent fields,
   and the gated nav entry.

Docs land with each plan: `data-model.md`, `entry-types.md` (a tenth column in
every matrix), `authorization.md`, `options.md`, `systems/notes.md` and
`api.md`.
