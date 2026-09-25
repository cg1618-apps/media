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
| D11 | Tenrai | **Tenrai fills airing status, release date, cover** - and nothing else (no names, studio, scores or AniList), under anime's fill-only rules. `mal_id` / `mal_link` columns as anime's. |

## Decisions made during implementation

| # | Question | Answer |
|---|---|---|
| I1 | Which relation direction derives the status? | Only `hentai -adaptation-> h-comic` ("the hentai is the Adaptation of the h-comic", per `relation_kinds.py`). The reverse row and other kinds do not count. |
| I2 | A write of `animation_status` while it is derived | **Refused (422)** for any value but the derived or the stored one; those two change nothing (the form echoes the served value). Implemented as a nested-collection writer so it sees the stored value before any flush. |
| I3 | KR h-comics | Have no animation status (it is cleared), so nothing is derived: `animation_status_source` is `null`. |
| I4 | Derivation and visibility | Derived from every adapting hentai, whatever the viewer can see: the status is a fact about the h-comic. |
| I5 | Completing a hentai | Movie's rule: status `Completed`, `airing_status` becomes `Finished Airing`. |
| I6 | Personal fields | `watching_status` (`WatchStatus`), `my_rating`, `usefulness`; plan flags `watch_next` / `to_rewatch`, entry scope only. |
| I7 | The family check on `franchise_id` | **Superseded.** First applied by the two gated types' write hooks only. `fix/gated-type-gaps` (#72) moved it into the router factory, which runs `check_entry_franchise_family` for **every** media type on create, update and the tracker PATCH body, before anything is written - so a mainstream entry named into a gated franchise by id is refused too, and hentai's hook no longer carries its own check. |
| I8 | The migration and mode grants | Besides removing the label from non-hentai entries, it removes any grant of `hentai` to a mode other than `unrestricted`. Neither is restored on downgrade; the label row is kept on downgrade because it may predate the revision. |

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
| `mal_id` / `mal_link` | Integer / String | as anime's; Tenrai's key (D11) |
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

- Key `hentai`, ensured by the migration and by the lifespan seed through
  the shared `gated_labels` module (#73): a `REQUIRED_LABEL_FOR_TYPE` entry
  and a `SYSTEM_LABELS` row, find by key, create if missing, grant to
  `unrestricted` only. Pull and Calculate re-attach it through the generic
  `enforce_gated_label_invariants`; hentai has no label code of its own.
- **The label already exists on the home database**, created by hand, carried
  by `unrestricted` alone, and attached to **one `anime` row** (Redo of
  Healer). Find-or-create by key adopts that row rather than duplicating it.
- **The migration removes the `hentai` label from every entry that is not a
  hentai** (the owner's decision for Redo of Healer). The label now means the
  type, so the step is written against the rule rather than the one title, and
  it runs on every database the migration reaches. Its downgrade does not put
  the labels back: which rows carried them is not recorded anywhere to restore
  from. Nothing refuses the label on another type afterwards, the same as
  `h-comic` today.
- Every hentai entry carries it on every write path, attached server-side in
  the registry hooks; a request that would remove it is refused (422), as for
  h-comic.
- It reaches no mode except `unrestricted`; a test asserts so, with the label
  and a labelled entry present so the assertion can fail.

## Franchises: families (shared with h-game)

The family mechanism exists on `dev` (#72); hentai joins it by one map entry
in `app/utils/constants.py`:

```python
FRANCHISE_FAMILY_FOR_TYPE: dict[str, str] = {
    "H-Comic": "h-comic",
    "Hentai": "h-comic",
    # "H-Game": "h-game"  - added by feat/h-game
}
MAINSTREAM_FAMILY = "mainstream"  # any type not listed
```

- A franchise's family is the family of its types. **A franchise whose types
  span two families is refused (422)** on create, update and patch
  (`franchise.py`'s `_check_type_family` -> `check_franchise_type_family`),
  and so is retyping a franchise into another family than an entry it holds
  (`check_franchise_entries_family`). `"H-Comic, Hentai"` is one family.
- An entry's family is the family of its auto-created franchise type
  (`FRANCHISE_TYPE_FOR[owner]`, `entry_family`): `hentai` stamps `Hentai`.
- The name resolver matches an entry only against franchises of its own
  family (`_segregation`), so a hentai named after an h-comic attaches to that
  h-comic's franchise, and never to a mainstream one.
- An entry of any type written with a `franchise_id` of another family is
  refused (422) by the router factory (`check_entry_franchise_family`) - see
  I7.
- A franchise carries the label of each gated type it holds
  (`gated_labels.ensure_franchise_labels`): `H-Comic` brings `h-comic`,
  `Hentai` brings `hentai`. One holding both carries both.
- Series are not segregated: a series names its parent.

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
- Pipelines: `PIPELINES["hentai"]` is anime's Tenrai spec minus AniList,
  with MAL pacing: Fill, bulk Replace and the single-entry write hook fetch
  `airing_status`, `release_date` and the cover (D11), then `run_sync_hentai`
  (system options) and `run_sync_gated_labels`, which keeps the label on every
  entry and every `Hentai` franchise. In Fill All and
  Replace All. Sheets tab `Hentai`.
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
