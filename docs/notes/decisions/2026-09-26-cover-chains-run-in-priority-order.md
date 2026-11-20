# Game cover chains: sources run in priority order, Steam's header last

The chains as they stand are in `external-apis.md` and `entry-types.md`: a game
takes IGDB, then Steam's library capsule, then Steam's header image; an h-game
takes DLsite, then the capsule, then IGDB, then the header.

- **Priority is order, not a merge.** Every cover write is if-empty, so
  running the sources in priority order *is* the priority. The one wrinkle is
  IGDB on an h-game, which must run before Steam to hand it an appid but must
  lose the cover to it: `autofill_game_from_igdb(cover=False)` runs early and
  `autofill_game_cover_from_igdb` fetches IGDB's cover later, only for an entry
  still without one.
- **Steam's capsule is a fallback on games, a priority on h-games.** A game
  IGDB has no cover for, or one linked to Steam alone, would otherwise stay
  coverless while Steam holds a good one; DLsite and Steam carry what an adult
  game's IGDB record most often lacks.
- **The capsule is looked up at the unhashed CDN path**, and a 404 there is "no
  capsule", rather than spending a storefront request to find a hashed path.
- **The header image is last, after IGDB too, in a function of its own**
  (`autofill_cover_from_steam_header`). It is landscape, so every portrait
  source outranks it; folded into the capsule function it would jump ahead of
  IGDB on an h-game. It is chained on the cover still being empty, so a capsule
  that exists but fails to download falls through to it. It re-reads
  `appdetails` rather than reusing the column fill's payload, so the cover
  functions stay independent — the missing-covers repair calls them without
  the column fill.
- **Eligibility is unchanged by the cover chain.** A Steam-only game whose Steam
  columns are filled is not re-queued for its cover alone, which keeps an app
  with no capsule from being re-requested on every run; Replace selects every
  entry with a `steam_appid`, so it reaches such a game.
- **DLsite's source is the storefront's own `product.json`.** DLsite has no
  API; of the two JSON endpoints its pages load, `/maniax/api/=/product.json`
  carries the cover, the date and the maker's name in one record, where
  `/product/info/ajax` has a maker id but no name and would need a second
  request. JP link first, TW link as the fallback — both name one product.
