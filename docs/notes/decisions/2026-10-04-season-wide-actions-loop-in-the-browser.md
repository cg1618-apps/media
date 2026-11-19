# Season-wide actions loop over the per-anime endpoints in the browser

The seasonal page's **Autofill & update** and **Mark finished airing** act on
every anime of a season.

- **No batch endpoint.** Each button calls the existing per-anime endpoint —
  the single-entry Replace and the ordinary `PATCH` — once per anime,
  sequentially. A season is a dozen or two entries, so a loop costs nothing
  worth a new route, and it keeps exactly the permission checks, validation
  and side effects of the detail page's buttons. Sequential, so Tenrai is not
  hit with a season's worth of requests at once.
- **Autofill skips an anime with no MAL link** rather than failing on it, and
  the confirmation says how many it will skip.
