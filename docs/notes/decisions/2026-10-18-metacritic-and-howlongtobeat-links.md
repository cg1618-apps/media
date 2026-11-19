# Metacritic from Steam, HowLongToBeat from the site's search, or nothing

A game's Metacritic and HowLongToBeat page links are filled automatically as
Reference Source rows. IGDB carries neither (its `external_games` supplies the
Steam appid, not these).

- **Metacritic comes from the Steam answer already fetched.** `appdetails`
  returns `metacritic.url` beside the score, so the link costs no request.
  Steam's URL is a legacy form with a tracking tag that Metacritic redirects to
  `/game/<slug>/`; the redirect target is what is stored. Rejected: storing
  Steam's URL verbatim.
- **HowLongToBeat comes from the site's own search, kept only when
  confident:** an exact match on a normalised name, aliases only when no name
  matches, the release year only to break a tie, and more than one survivor is
  no link. Rejected: a fuzzy "best" match, which puts plausible wrong links on
  the Sources card where nobody checks them; and a search-results URL, which
  links to a question rather than to the game.
- **The search is undocumented, so the client fails quietly.** It reads the
  endpoint's path out of the site's script and fetches a token the way the page
  does, and answers every failure as None. Rejected: depending on
  `howlongtobeatpy`, which brings several runtime dependencies for three
  `requests` calls and randomises its User-Agent, which the token is bound to.
- **Fill asks only for the entries it queues, and does not repeat a miss.** A
  search is not free, so it is not in post-processing. A miss is remembered per
  process and retried by a bulk Replace or the Autofill button — not by an
  ordinary save, which would add a slow search to every save of an unmatched
  game. Rejected: storing "searched, not found", which is a migration and a
  gated release for what a restart costs one extra search to forget.
- The time-to-beat **figures** still come from IGDB; HowLongToBeat is asked for
  its page link only.
