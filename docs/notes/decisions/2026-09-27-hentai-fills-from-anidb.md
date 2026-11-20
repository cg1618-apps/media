# Hentai fills from AniDB after MAL

- **Why AniDB.** MAL does not list many hentai OVAs, and the cover is what goes
  missing most. AniDB catalogues them, publishes a documented HTTP API and
  serves covers from an open CDN. It is a second source: fill-only, keyed off a
  pasted link, run after MAL so it only fills gaps. It never writes a name —
  the names are the entry's identity.
- **An `anidb_id` column beside `anidb_link`**, following the `mal_id` /
  `mal_link` pair hentai already has, rather than reading the id out of the
  link on every use.
- **A registered client, and off without one.** AniDB answers only a client
  registered on the site (`ANIDB_CLIENT` / `ANIDB_CLIENTVER`). Unset, nothing
  is sent and fill eligibility turns false too, so an unconfigured machine
  does not queue entries nothing would fill. No client name is invented or
  borrowed: AniDB bans by client.
- **Pacing is set by AniDB's bans, not by a rate limit.** AniDB bans a client
  that asks more than about once every two seconds, or fetches the same anime
  twice in a day. So requests are 4 s apart, every answer is cached for 24
  hours in-process, and the first error answer other than a not-found halts
  the client and becomes the run's `budget`: the run stops and reports the
  rest as left for the next run. That stops the MAL half of the remaining
  entries too — accepted, because continuing to call a banning server is what
  extends a ban. The next run's `pre_run` lifts the halt.
