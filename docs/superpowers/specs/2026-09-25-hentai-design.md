# Hentai — design

An eleventh media type, `hentai`: adult anime, seen in the `unrestricted`
access mode only. It is to anime what `h-comic` is to manga, and it follows
h-comic's shape wherever the owner has not said otherwise: a table of its own,
a gated type behind its own content label, and a franchise type kept apart
from the mainstream.

It is being built alongside `h-game` (session media-71, `feat/h-game`). The
points the two share are marked **(shared with h-game)** and were agreed
between the sessions before either wrote code.

## Decisions settled with the owner

| # | Question | Answer |
|---|---|---|
| D1 | Own table, or an `anime` row with a label? | **Own table, `hentai`.** Its fields are h-comic's more than anime's. |
| D2 | Content label | **Its own, `hentai`.** A gated type: `REQUIRED_LABEL_FOR_TYPE["hentai"] = "hentai"`. |
| D3 | Episodes | **One entry is one episode.** No `ep_total`, no `ep_fin`; watch orders treat it as whole. |
| D4 | Adaptation type | A column saying whether it is adapted from a manga or a novel, or original. Named `source_material`. |
| D5 | Franchise | A new franchise type `Hentai`. **An h-comic and its hentai adaptation may share one franchise**, as anime and manga do. |
| D6 | Genres | **The three h-comic genre vocabularies, shared** across h-comic, hentai and h-game. No hentai-specific vocabulary. (shared with h-game) |
| D7 | Notes | **No section of its own.** Hentai gets the sections every entry has (remarks, comments, ...) and nothing type-specific. |
| D8 | h-comic `animation_status` | **Derived from an adaptation relation to a hentai when one exists; hand-set otherwise.** |
| D9 | h-comic usefulness | No change - it already exists on both regions. |
| D10 | h-game | Stays separate: never shares a franchise with h-comic or hentai. |

## The table: `hentai`

The common entry columns (franchise, series, cover, remarks, ...) come from the
`media` supertable, as for every type.

| Column | Type | Notes |
|---|---|---|
| `system_id` | UUID PK | |
| `media_type` | String, `'hentai'` | `fk_hentai_media` composite FK and `ck_hentai_media_type`, as on every type |
| `hentai_name_en` / `_cn` / `_roman` / `_jp` / `_alt` | String | anime's five; display order CN, EN, Alt, roman, JP |
| `source_material` | String | `HENTAI_SOURCE_MATERIALS = ("Original", "Manga", "Novel")` |
| `originality` | String | `原創` / `同人`, the `H_COMIC_ORIGINALITY` vocabulary |
| `series_number` | Integer | Position in its series |
| `airing_status` | String | anime's `AiringStatus` vocabulary |
| `release_date` | String | ISO CHECK `ck_hentai_release_date_iso` |
| `created_at` / `updated_at` | DateTime | |

### Stored elsewhere

| Field | Where |
|---|---|
| watching status | `user_media_list.status` |
| my rating | `user_media_list.my_rating` |
| usefulness | `user_media_list.usefulness`, `H_COMIC_USEFULNESS` - the column h-comic uses |
| studio | `media_credit`, role `studio` - its scope gains `hentai` |
| director | `media_credit`, role `director` - its scope gains `hentai` |
| genres | `media_tag`, fields `h_genre_plot` / `h_genre_appearance` / `h_genre_relation` - their scopes gain `hentai` |

Studio and director are shared with mainstream anime. The shared-record rule
already covers that: a studio credited on a mainstream anime stays visible
through it, and one credited only on hentai is hidden with them.

## The content label

- Key `hentai`, ensured by the migration and by the lifespan seed, the way
  `ensure_label` does it for `h-comic`: find by key, create if missing, grant
  to `unrestricted` only.
- **The label already exists on the home database**, created by hand, carried
  by `unrestricted` alone, and attached to **one `anime` row** (Redo of
  Healer). Find-or-create by key adopts that row rather than duplicating it,
  and the anime row is not touched. Whether that anime keeps the label is the
  owner's call, not this feature's.
- Every hentai entry carries it on every write path, attached server-side in
  the registry hooks; a request that would remove it is refused (422), as for
  h-comic.
- It reaches no mode except `unrestricted`; a test asserts so, with the label
  and a labelled entry present so the assertion can fail.

## Franchises: families (shared with h-game)

Today the resolver keeps `H-Comic` apart with a special case. It becomes a
mapping, in `app/utils/constants.py` beside `FRANCHISE_TYPES`:

```python
FRANCHISE_FAMILY_FOR_TYPE: dict[str, str] = {
    "H-Comic": "h-comic",
    "Hentai": "h-comic",
    # "H-Game": "h-game"  - added by feat/h-game
}
# any type not listed is family "mainstream"
```

- A franchise's family is the family of its types. **A franchise whose types
  span two families is refused (422)** on create and update.
- An entry's family is the family of its auto-created franchise type
  (`FRANCHISE_TYPE_FOR[owner]`): `hentai` stamps `Hentai`.
- The name resolver matches an entry only against franchises of its own
  family, so a hentai named after an h-comic attaches to that h-comic's
  franchise, and never to a mainstream one.
- A hentai written with a `franchise_id` of another family is refused (422).
- A franchise carries the label of each gated type it holds: `H-Comic` brings
  `h-comic`, `Hentai` brings `hentai`. One holding both carries both.
- Series are not segregated, as today: a series names its parent.

## h-comic `animation_status`, derived

The `adaptation` relation kind already exists (`app/utils/relation_kinds.py`).

- An h-comic with one or more `adaptation` relations to hentai entries has a
  **derived** status: `Animated` if any of them has aired (`Airing` or
  `Finished Airing`), otherwise `Announced`.
- With none, the stored hand-set value stands, as today - which is how
  `Announced` is recorded before the hentai entry exists.
- **Derived at read time, not written.** The column keeps the hand-set value,
  so removing the relation restores it rather than leaving a stale derived
  one; nothing needs recomputing when a relation or an airing status changes.
  The response carries `animation_status` (effective) and
  `animation_status_source` (`"derived"` or `"manual"`).
- The form makes the field read-only while it is derived, and names the
  hentai it comes from.
- The relation's direction is read from `relation_kinds.py` when the plan is
  written, not assumed here.

## Everything else, following h-comic

- Registry entry, router from the factory, `/api/hentai`, schemas with
  vocabulary checks on write.
- Pipelines: `PIPELINES["hentai"]` fetches nothing; `run_sync_hentai` keeps
  the label on every entry and every `Hentai` franchise. Sheets tab `Hentai`.
- Duplicates: `franchise_id`, `series_id`, `series_number`.
- Watch orders: `hentai` joins `WHOLE_ONLY_TYPES`.
- Frontend: library config, detail page, add and modify tabs, nav row - all behind the gated-type check, as h-comic's.
- Docs: every page h-comic touched, and `docs/notes/decisions.md` for D1, D5
  and D8.

## Delivery

Two pull requests into `dev`, as h-comic had: **backend** (migration, model,
label, families, derived status, pipelines, tests, docs), then
**frontend**. The visibility groundwork h-comic needed already exists.

Collision points with `feat/h-game`: `REQUIRED_LABEL_FOR_TYPE`, the three
`h_genre_*` scopes, `FranchiseType` / `FRANCHISE_TYPES`,
`FRANCHISE_FAMILY_FOR_TYPE`, and Alembic - whoever merges second reparents
onto the new head and checks `alembic heads`.
