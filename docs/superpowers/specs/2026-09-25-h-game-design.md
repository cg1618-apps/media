# H-Game — design

A new media type, `h-game`: adult games, seen in `unrestricted` mode only. It is
to `game` what `h-comic` is to `manga`. It has a table of its own, `h_game`,
and reuses Game's machinery (IGDB and Steam fill, purchase records, DLC chains,
the game note sections), not Game's table.

## Decisions settled with the owner

| # | Question | Answer |
|---|---|---|
| D1 | Own table, or a flag on `games`? | **Own table `h_game`**, type key `h-game`, route `/api/h-game`, registry key `h_game`. |
| D2 | Names | Five: `h_game_name_cn`, `_en`, `_jp`, `_roman`, `_alt`. Display fallback CN → EN → Alt → Roman → JP, as Game. |
| D3 | Play style | `playstyle`: `ADV`, `RPG`, `SLG`, `Other`, or null. Single choice. |
| D4 | DLC chains | Kept. `game_type` uses Game's `GAME_TYPES`; `base_game_id` is a self-FK on `h_game`, `SET NULL`, with Game's two CHECKs. |
| D5 | Release status | `release_status`, Game's `GAME_RELEASE_STATUSES`. |
| D6 | Game fields kept | `current_patch`, `completion_level`, `all_endings`, `achievements_earned/total`, `steam_progress_sync`, the three `hltb_*`, the six `price_*`, `type_slots`. |
| D7 | Game fields dropped | `hours_played`, `metacritic_*`, `all_achievements`, `all_collected`. H-Comic's `originality`, `animation_status`, `region` and its region-only columns are dropped too. |
| D8 | CG completion | `all_cg`, Game's `GAME_COMPLETION_FLAGS` (Yes / No / Inapplicable / null). |
| D9 | Language | `language_availability`: `官方中文`, `中文補丁`, `無中文`, or null. Single choice. |
| D10 | Audio | `audio_availability`: multi-choice over `一般對話`, `H場景`. |
| D11 | Animation | `animation_availability`: boolean, nullable (null = unknown). |
| D12 | H 演出形式 | `h_presentation`: multi-choice over `靜圖`, `動圖`, `2D動畫`, `3D動畫`, `互動`. |
| D13 | Platform | `platform`: multi-choice over `Steam`, `DLsite`, `Nintendo`, `Other`. Hand-set, **never filled from IGDB**. Not Game's `game_platform` tag field. |
| D14 | How the fixed-choice fields are stored | **Fixed vocabularies in `app/utils/constants.py`, not system options.** The multi-choice ones are JSONB lists, validated by the write schemas and by the Sheets parser. |
| D15 | Links | `igdb_id`, `igdb_link`, `steam_appid`, `steam_link` as Game; `dlsite_link_jp` and `dlsite_link_tw`, plain strings, no id. Nothing fetches DLsite. |
| D16 | Purchase records | **Shared with Game.** `game_copy.game_id` moves its FK from `games.system_id` to `media.system_id`. The Sheets tab stays `Game Copy`. **Game Spend counts games only.** |
| D17 | IGDB fill | Game's set: release date, IGDB link, the Steam pair, the three time-to-beat estimates, the `studio` credit, cover, DLC parent. **Also `game_genre` and `game_theme`**, whose scopes extend to `h-game`. Not `game_mode`, not `game_platform`, not `publisher`. |
| D18 | Steam fill | Game's, limited to the columns `h_game` has: prices, `achievements_total`, and `achievements_earned` under `steam_progress_sync`. The SteamDB reference source row is derived as for Game. |
| D19 | Per-user | `playing_status` (Game's vocabulary), `my_rating`, `usefulness` (`H_COMIC_USEFULNESS`) on `user_media_list`. No progress column. |
| D20 | Credits | `studio` only. |
| D21 | Genres | The three `h_genre_*` tag fields, **shared** across h-comic, hentai and h-game (agreed with the hentai session). Plus `game_genre` and `game_theme` (D17). |
| D22 | Content label | Own system label `h-game`, in `REQUIRED_LABEL_FOR_TYPE`, reaching `unrestricted` only. |
| D23 | Franchise | Own franchise type `H-Game`, a family of its own: an h-game never shares a franchise with an h-comic, a hentai or a mainstream entry. Series live under it. |
| D24 | Notes | Every game note section, as reshaped by PR #70 (Story / Story Setting). Plus `h_game_highlights`. |
| D25 | Highlights | KR `h_comic_highlights`' fields, with the locator labelled **Route / Scene**; grouped by female characters; group order in `h_game.highlight_group_order`. No `owner_where`: every h-game has it. |

## The `h_game` table

Same shape as `h_comic` for the parts every type has: `system_id` PK, a
constant `media_type = 'h-game'` pinned by `ck_h_game_media_type`, the deferred
composite FK `fk_h_game_media` onto `media (system_id, media_type)`, the
`h_game_public_id_seq` sequence, the `trg_h_game_delete_media` trigger, and
`created_at` / `updated_at`. `release_date` carries the ISO CHECK.

| Column | Type |
|---|---|
| `h_game_name_cn/en/jp/roman/alt` | String |
| `series_number` | Integer |
| `playstyle` | String |
| `game_type` | String |
| `base_game_id` | UUID, FK `h_game.system_id` `SET NULL` |
| `release_status` | String |
| `release_date` | String, ISO CHECK |
| `current_patch` | String |
| `completion_level` | String |
| `all_endings`, `all_cg` | String |
| `steam_progress_sync` | Boolean |
| `achievements_earned`, `achievements_total` | Integer |
| `hltb_main`, `hltb_main_extra`, `hltb_completionist` | Float |
| `price_original_us/jp/tw`, `price_current_us/jp/tw` | Numeric(10,2) |
| `language_availability` | String |
| `audio_availability` | JSONB list |
| `animation_availability` | Boolean |
| `h_presentation` | JSONB list |
| `platform` | JSONB list |
| `igdb_id` | Integer |
| `igdb_link`, `steam_link`, `dlsite_link_jp`, `dlsite_link_tw` | String |
| `steam_appid` | Integer |
| `highlight_group_order` | JSONB list |
| `type_slots` | JSONB |

Game's CHECKs `ck_games_base_no_parent` and `ck_games_not_self_parent` are
mirrored as `ck_h_game_base_no_parent` and `ck_h_game_not_self_parent`.

No CHECK constrains a vocabulary, matching Game: the vocabularies live in
`constants.py` and reach the client through `/api/constants`
(`TYPE_ONLY_VOCABULARIES["h-game"]`).

## Purchase records (`game_copy`)

`game_id` keeps its name (renaming it reshapes the `Game Copy` tab) and its
values. Every entry shares its `system_id` with its `media` row, so every
existing value is already a valid `media.system_id`. The migration drops the FK
to `games` and adds one to `media` with the same `ON DELETE CASCADE`.

What moves from "game" to "game or h-game":

- `attach_own_copies` (`game_copies.py`), which returns early unless the owner
  type is `game`.
- `write_game_copies`, bound to the `Game` model's copies.
- The ownership list filter (`registry.py` `_game_ownership`), per model.
- A `copies` relationship on `HGame`, as on `Game`.

Game Spend reads the copies of the `game` list only, so H-Game spend never
reaches it and no statistics change.

## Fill: IGDB and Steam

`autofill_game_from_igdb` and `autofill_game_from_steam` are generalised over
the model and the owner type instead of copied:

- The credit and cover calls take the owner type instead of the literal
  `"game"`.
- The DLC parent lookup queries the entry's own model.
- A write happens only when the model has the column. Steam writes no
  `hours_played` or `metacritic_score` on an h-game, and IGDB writes no
  `game_mode`, `game_platform` or `publisher`.

`PIPELINES["h-game"]` mirrors `PIPELINES["game"]` and is in Fill All.
`/api/h-game/search-igdb` mirrors Game's picker endpoint.

## Gating

What H-Comic hard-codes to itself, and the fix H-Game needs:

- **`ensure_label` / `ensure_entry_label` / `ensure_franchise_label` / the
  label-removal refusals / `enforce_*_invariants`.** These are bound to the
  h-comic constants in `app/services/domain/h_comic.py`. They are generalised to
  take the label and the model, and are called once per entry of
  `REQUIRED_LABEL_FOR_TYPE`.
  **The hentai session needs the same generalisation.** Whoever lands first
  does it, and the other appends.
- **Franchise families.** `hierarchy.py`'s `SEGREGATED_TYPE` becomes
  `FRANCHISE_FAMILY_FOR_TYPE` in `constants.py`: franchise type → family key,
  `"mainstream"` for any type not listed. The agreed entries are `H-Comic` →
  `h-comic`, `Hentai` → `h-comic`, `H-Game` → `h-game`. A franchise whose
  types span two families is a 422, and an entry attaches only to a franchise
  of its own family, both ways. `media-fc` is fixing the by-id half of this for
  h-comic; H-Game appends its entry.
- **Frontend.** The `/library/h-game` and `/h-game/...` routes are static
  `<ProtectedRoute gatedType="h-game">` blocks, declared before
  `/library/:type`, as H-Comic's are. The nav row, admin tabs, add, modify and
  delete tabs, and the favourite grids are all gated on `h-game`.

## Notes

- `GAME_OWNERS = ("game", "h-game")` in `note_sections.py`. Every section that
  names `("game",)` today, including `_story_list_sections()`,
  `episode_comments`' `labels` / `locator_placeholders`, and `analysis`'
  `groups_by_owner`, names it instead. A future game section reaches h-game by
  default.
- `h_game_highlights` copies `h_comic_highlights`' fields. It is only the
  second copy, so it is not factored out. The group order is
  `h_game.highlight_group_order`, normalised the way H-Comic's is.

## Visibility tests

As for H-Comic, and under the root `CLAUDE.md` rule: every refusal test seeds
the `h-game` label and a labelled entry so the hidden set is non-empty, and
asserts the mirror case, where `unrestricted` sees the same row. The shared
genre categories stay gated only while every type in their scope is gated,
which is true of `h_genre_*` and false of `game_genre` / `game_theme`. That
second fact is intended (owner: those values are ordinary genres).

## Delivery

Two PRs into `dev`, as H-Comic was: **backend** (model, migration, gating,
fill, Sheets, notes registry, docs) then **frontend** (library, detail page,
add / modify / delete, highlights, favourites, docs). The migration's
`down_revision` is re-checked against `alembic heads` when it is written, and
again before merge: the hentai session adds a revision too.
