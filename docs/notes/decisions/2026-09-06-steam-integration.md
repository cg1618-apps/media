# Steam: the appid from IGDB, two hosts, and a lock on progress

- **The appid comes from IGDB's `external_games`**, and the link is synthesised
  from the appid rather than read from `websites`, so its shape is ours and
  stable. A hand-typed link wins, and an unparseable link leaves an existing id
  untouched.
- **One Fill pass does the whole job** for a game entered with only an IGDB
  link: IGDB writes `steam_appid`, then the Steam phase reads it. A game with no
  Steam presence never gets an appid, and that is never logged as an error.
- **Two hosts, two auth stories, deliberately split.** The storefront
  (`appdetails`) needs no configuration; the Web API needs a key and a steamid
  for playtime and achievements earned. A missing key, steamid or private
  profile skips only the progress phase with one warning.
- **`GetOwnedGames` is fetched once per run**, not per game: it returns the
  whole library with playtime in one response.
- **The cached library decides whether to ask about achievements at all.**
  `GetPlayerAchievements` answers `403 "Profile is not public"` for an app the
  account does not own, even on a public profile. So the appid is checked
  against the library first; the skip applies only when the library is
  *known*, so an unreachable library cannot mask a real privacy failure.
- **Steam sets the pace of Fill Game.** The storefront's unofficial ceiling is
  about 200 requests per 5 minutes per IP; a sliding-window limiter guards it
  and a `budget` hook stops a Fill All cleanly rather than blocking.
- **`steam_progress_sync` is a per-entry lock** for a game owned on Steam but
  played elsewhere, which a Replace would otherwise overwrite. It governs the
  two progress columns and nothing else.
- **Two guards on every progress write**, in order: the lock, then **skip on 0
  or None**. A game owned but never launched reports `playtime_forever = 0`, and
  without the zero guard the first run would wipe a hand-typed figure before
  anyone had reason to set the lock.
- **`GAME_FIELDS_TO_FILL` is deliberately not extended** with Steam's fields.
  Every free, unrated or achievement-less game would stay eligible forever.
  Eligibility is instead "has an appid and Steam has written nothing at all".
