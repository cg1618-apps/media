# Games: one table, completion on several axes, ownership in game_copy

- **One `games` table, not two.** A DLC is a `games` row with `game_type =
  "DLC"` and a self-FK `base_game_id`. Anime and Anime Movie are separate tables
  because they are different metadata shapes from different sources; a game and
  its DLC share nearly every column and differ mainly in having a parent. It
  also keeps the cross-table discriminator space small. **`base_game_id` stays
  nullable**: a DLC is often entered before its base game, and a write that
  fails on ordering is worse than a link filled in later.
- **Completion is several axes, not one dropdown.** A single six-value
  `completion_level` was three questions in one field with incoherent ordering.
  `completion_level` is a genuine ladder that statistics can sort on, and the
  ending and achievement flags are orthogonal to it — every ending can be seen
  on a main-story run, or missed on a completionist one, and in-game 100% and
  full achievements routinely disagree.
- `completion_level` is independent of the playing status: active playing plus
  *Main Story* is the common state of having rolled credits and still playing.
  Marking a game completed sets the status and leaves the completion fields
  alone — only the player knows the depth.
- **Ownership lives in `game_copy`, not `media_source`.** "Where can I play
  this" and "which storefront do I own it on" looked like one question at one
  field and broke at six — at that size it is a purchase record, and on a table
  shared by every media type the columns would be meaningless for all the
  others. Entry-level ownership is **derived** through the registry's
  `extra_filters` hook with an `EXISTS` subquery, so there is nothing to keep in
  sync.
- **IGDB has no crew data**, so the credit design follows it honestly: a game's
  developer is its `studio` (no `developer` role), `publisher` is its own
  entity, and `director` and `composer` are hand-entered.
- **Player type and genre are tags, not columns.** Multi-value removes the
  awkward cases: Minecraft is `{Single-player, Multiplayer}` with no "Both".
  `game_genre` and `game_theme` stay separate because IGDB draws the same
  mechanical-versus-thematic line.
- **Guides are a note shape of their own, `name_entries`, on a nullable JSONB
  `note.entries`.** Rejected: widening `links` to hold richer objects, which
  would make `links` mean plain URLs in some sections and objects in others.
- **Publisher is its own table, not a reuse of `Studio`.** Most publisher
  values are Taiwanese distributors that never developed anything, and putting
  them on the studio library would make that page mean something vaguer. The
  duplicate row for a company that both develops and publishes is accepted.
- **Vocabulary is Chinese; an external source's English is an alias** in
  `system_option_alias`, shaped like the scope and usage tables. An IGDB value
  with no alias is logged, not silently dropped, so a new genre surfaces as a
  gap. Rejected: a dict in the client, which needs a deploy to retranslate.
- **Scope rows are mandatory when seeding game vocabulary.** A value with no
  scope is offered everywhere, so without them 角色扮演 would leak into anime's
  genre picker. A test enforces it.
