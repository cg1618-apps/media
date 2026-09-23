# H-Comic — design

A tenth media type, `h-comic`: adult comics, seen in `unrestricted` mode only.
It is to manga what hentai is to anime — except that hentai is an `anime` row
carrying the `hentai` label, while h-comic gets a table of its own, because its
fields are too different from manga's to share one.

## Decisions settled with the owner

| # | Question | Answer |
|---|---|---|
| D1 | Reuse `manga`, one new type, or two new types? | **One type, `h-comic`, with `region` JP / KR.** Same pattern as manga's `region` and novel's `novel_type`: variant-dependent fields, hidden and cleared by variant. |
| D2 | Originality values | `原創`, `同人`, or null. JP only. |
| D3 | Club | A studio-like idea, schema-wise an **author**: a `person` row credited under a new `club` role. Artists belong to clubs. |
| D4 | Usefulness | `非常實用`, `實用`, `特定情況實用`, `不實用`, or null. **Personal**, on `user_media_list`, like `my_rating`. |
| D5 | Animation status | Hand-set, **JP only**: `Not Animated`, `Announced`, `Animated`, or null. A link to hentai entries comes later and is out of scope. |
| D6 | Characters | Real `character` rows through `character_casting`, as for every ACG type. |
| D7 | Series number | The entry's position in its `series`, like a volume number. JP only. |
| D8 | Chapters behind the official source | **Hand-set** by the owner, a catalogue column. Not derived. |
| D9 | Franchise | A **new franchise type `H-Comic`**. An h-comic never sits in a mainstream franchise. |
| D10 | Official source | The existing `original_source` tag field, as on cartoons, with its scope extended to `h-comic`. |
| D11 | What stays hidden | **Everything connected only to h-comic** — entries, franchises, series, people in every role (author, artist, club), characters, and vocabulary values such as official sources and genres. See "Visibility". |
| D12 | Derived hiding keys on labels only | A person hidden by a *media-type permission* gap (a guest who lacks `game`) stays visible, as today. Only label-hidden appearances count. |
| D13 | Notes | Remark list, my comment, public comment and characters work as on every other type. **KR gets a highlights section**; **JP gets none**. |

## The content label, and the type that requires it

- A system label, key `h-comic`, created by a migration and by the lifespan
  seed, for the reason `seed_modes.py` gives: API tests build the schema with
  `create_all` and never run Alembic.
- **`REQUIRED_LABEL_FOR_TYPE = {"h-comic": "h-comic"}`**, which the rest of the
  design keys on. A media type naming a required label is a **gated type**.
- **Every h-comic entry carries the label, on every write path**: the form, the
  tracker PATCH, Pull, and a sheet restore. It is attached server-side in the
  registry `write_hook`, and a request that would remove it is refused (422).
  A missing label means a public entry, so this is not left to the admin.
- **Every `H-Comic` franchise carries it** through `franchise_content_label`,
  attached on auto-create and on any change to type `H-Comic`.
- **It reaches no mode except `unrestricted`**, which derives every label.
  `borderline` carries every label only as of its seed. The plan has to prove
  the h-comic label does not reach it: a test asserts that the only mode
  carrying `h-comic` is `unrestricted`.

A viewer **can see a gated type** when their session's mode carries its
required label. Everything below that says "hidden" means hidden from a viewer
who cannot see the gated type, or more generally from a viewer whose mode lacks
the label hiding it.

Negative tests follow the root `CLAUDE.md` rule: the refusal tests create the
label and a labelled entry, so the hidden set is not empty. Each refusal is
paired with the mirror case, where `unrestricted` sees the same row.

## Visibility: everything connected only to h-comic

The label already hides the entry everywhere `enforcement.py` reaches, including
lists, search, relations, watch orders, quotes, memes and detail pages (404).
What leaks today is everything the entry *points at*, because those records
carry no label. The rule for all of them:

> **A shared record is hidden when every connection it has is hidden.** A
> connection is an appearance on an entry (hidden when the entry is
> label-hidden) or a scope naming a gated type (hidden when the viewer cannot
> see that type). A record with no connections at all stays visible, as today.

Hidden means the same thing it means for an entry:
- absent from list, search, filter and combobox endpoints
- 404 on its detail page
- its photo not served by `/api/covers`, which currently serves entity owners
  to everyone (`docs/authorization.md`, the covers row)
- notes attached to it are 404

A record with one visible connection stays visible, and only the hidden
connections drop out, which is what `filter_visible_pairs` already does. So a
character in both Fate and a Fate-themed h-comic is visible through Fate, and
an artist who also draws mainstream manga keeps a page listing only the
mainstream work.

Nothing needs remembering: crediting someone on a normal work reveals them, and
removing that credit hides them again.

This reverses a rule stated today. `app/routers/person.py`'s `/entries`
docstring says "the person is not the secret, their credits are", and
`character.py`, `studio.py` and `publisher.py` follow it. Those docstrings and
the matching paragraph in `docs/authorization.md` are rewritten to state the
new rule.

| Record | Connections |
|---|---|
| person, in any role (author, artist, club, and every existing role) | `media_credit` rows; `person_role` scopes |
| character | `character_casting` rows |
| studio, publisher | `media_credit` rows; `publisher_scope` for publishers |
| vocabulary value (official source platform, genre, …) | `media_tag` rows; `system_option_scope` rows |
| franchise | label on the franchise itself, as today |
| series | its franchise (below) |

Two cases show why scopes count as connections:
- **A club created before its first credit** holds only the `club` role, whose
  sole scope is `h-comic`. Without scopes it would have no connections and
  would stay visible.
- **The three genre vocabularies** exist only for h-comic. An unused genre
  value has no `media_tag` row, only its scope, so without scopes it would
  show in every narrower session's option list.

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
not a connection: it cannot make a hidden club or artist visible. A visible
club's member list omits hidden members.

### Series under a hidden franchise

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
| `animation_status` | String | ✓ | | `H_COMIC_ANIMATION_STATUSES = ("Not Animated", "Announced", "Animated")` |
| `series_number` | Integer | ✓ | | Position in the series (D7) |
| `serialization_status` | String | ✓ | ✓ | reuses `MANGA_SERIALIZATION_STATUSES` |
| `page_total` | Integer | ✓ | | |
| `ch_total` | Integer | | ✓ | |
| `ch_behind` | Integer | | ✓ | Chapters behind the official source, hand-set (D8) |
| `release_date` / `end_date` | String | ✓ | ✓ | ISO CHECKs, like manga's |
| `highlight_group_order` | JSONB | | ✓ | Manual order of the highlight groups (see "KR highlights") |

**One table, two variants.** The JP-only and KR-only columns share one table
because the variants share most of their fields. `docs/data-model.md` marks
each column's variant in its description, so the table reads correctly without
the spec.

Variant rule, following novel's volume-only rule: the columns a region does
not use are **cleared on every write path**, not only hidden in the form. The
cleared columns are `originality`, `animation_status`, `series_number` and
`page_total` on KR, and `ch_total` and `ch_behind` on JP. A name column the
region does not use is kept but not shown, since a name is harmless.

Virtual fields: `display_name` (CN → EN → Alt → JP/KR), plus the usual credit
and tag link fields.

**Personal columns** (`user_media_list`): `reading_status` (ReadStatus, default
`Might Read`), `my_rating` (MY_RATINGS), `completed_at`, `ch_fin` (existing
column, KR), plus two new nullable columns:
- `page_fin` (Integer, JP; default 0 in `LIST_FIELD_DEFAULTS`)
- `usefulness` (String, `H_COMIC_USEFULNESS`, both regions)

### Credits and tags

| Field | Mechanism |
|---|---|
| artists | `illustrator` credit role, scope extended to `h-comic`. Label override `("illustrator", "h-comic")` → 繪師 |
| author (KR) | `author` credit role, scope extended to `h-comic` |
| club | **new** person credit role `club` (`CreditRole("club", "Club", "person", ("h-comic",))`) |
| official source (KR) | `original_source` tag field, scope extended (D10) |
| genre plot / appearance / relation | three new tag fields, `h_genre_plot`, `h_genre_appearance`, `h_genre_relation`, scoped `("h-comic",)`, with admin-managed vocabularies |
| sources | `media_source`, as every type |

The pinned sets in `tests/unit/test_credit_roles.py` (eight keys, the exact
`PERSON_ROLES`, the legal scopes) and the frontend mirrors (`fieldOptions.js`
`PERSON_ROLES` and `LEGAL`, `PersonSubTabBar`) move together.

## Notes

Both regions, unchanged from every other entry type:

| Owner's note | Section |
|---|---|
| remark | `remark_list` (already `ALL_OWNERS`) |
| my comment | `personal_reviews` (already `ALL_OWNERS`, personal scope) |
| public comment | `public_reviews` (already `ALL_OWNERS`, catalogue scope) |
| characters | `character_casting`, with `h-comic` added to `CASTING_MEDIA_TYPES`. `ck_casting_voice_scope` already rejects a seiyuu there. |

The other `ALL_OWNERS` sections reach `h-comic` automatically, as they reached
`game`.

### KR highlights: `h_comic_highlights`

A new `structured` section, owners `("h-comic",)`, catalogue scope. **KR
entries only**: the validator refuses it (422) on a JP entry, and a JP detail
page renders no card for it.

| Field | Type | Column | Notes |
|---|---|---|---|
| female characters | **names** (new) | `fields.female_characters` | Required. Several allowed. |
| male characters | **names** (new) | `fields.male_characters` | Optional. Several allowed. |
| chapter | text | `locator` | Free text, e.g. `1-5` |
| location | text | `fields.location` | |
| label | text | `kind` | Free text: a `kind`-backed field with no options |
| usefulness | select | `status` | `H_COMIC_USEFULNESS` |
| description | textarea | `content` | |

**The `names` field type** is new to `NoteField`. It holds a list of free-text
strings and is stored in `fields`, never in a column. Its input is a
multi-value combobox that suggests the display names of the characters cast on
this entry. A name that matches no cast character is still accepted, which is
what "free text" means. The strings are not character ids: renaming a
character does not rewrite old highlights. That is the price of free text, and
it is the reason to note it.

**Grouped rendering** is new to the structured component. A new
`NoteSection.group_by = "female_characters"` makes the read view draw one
group per female character name. A row naming two female characters appears
under both.

**Manual order is of the GROUPS, not the rows.** The owner orders female
characters ("abc above bde"); the order of rows inside a group does not matter
and follows `sort_index` (creation order), with no drag handle.

The group order is a catalogue column on the entry,
`h_comic.highlight_group_order` (JSONB list of names, nullable), written by
dragging a group header in the read view. At read time, groups follow the list,
and names absent from it are appended in first-appearance order. A name in the
list that no row carries any more is ignored when rendering, and it is dropped
on the next group-order save. A column on the entry rather than a table,
because the order belongs to one entry's highlights and is only ever read and
written whole.

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
- **Dashboard:** none.
- **Navigation:** library entry `/library/h-comic`, shown only when the
  viewer's mode can see the gated type, so a narrower session is not told the
  type exists. Both SPA permission surfaces (`App.jsx`'s `ProtectedRoute` and
  `navigation.js`) ask the same question.
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

1. **Visibility groundwork**:
   - the "every connection hidden" rule for people, characters, studios,
     publishers and vocabulary values
   - series under a hidden franchise
   - hidden entity photos and notes
   - `REQUIRED_LABEL_FOR_TYPE`, empty at first

   It ships behaviour-neutral for data with no labels, and it can be proven
   against the existing `hentai` label before any h-comic exists. Scope
   connections to a gated type have nothing to act on until plan 2 registers
   one, so their tests use a type registered for the test.
2. **Backend type**:
   - the migration, model and registry
   - the label and its enforcement
   - credits, club membership, tags and casting
   - the KR highlights section with the `names` field
   - Sheets and pipelines

   It adds an Alembic revision, so its `down_revision` is checked against
   `alembic heads` when the plan is executed.
3. **Frontend**:
   - the library, detail and forms, and the region-dependent fields
   - the gated nav entry
   - the `names` combobox and grouped, reorderable highlights

Docs land with each plan: `data-model.md`, `entry-types.md` (a tenth column in
every matrix), `authorization.md`, `options.md`, `systems/notes.md` and
`api.md`.
