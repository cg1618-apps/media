# A film has a release status; Rumored is gone; an anime movie is Cinema or ONA

- **No vocabulary carries `Rumored`.** It said nothing a "not yet" status does
  not. An older backup's `Rumored` reads per type: `Not Yet Aired` on an airing
  type, `Not Released` on a film, `Unreleased` on a game.
- **Movie and Anime Movie have `release_status`, with its own vocabulary**
  (`Not Released`, `Released`, `Canceled`): a film is released once, so it has
  no `Airing`. The column replaced the old one rather than sitting beside it, so
  there is one way to say it.
- **`Not Released` counts as unfilled for Fill.** A new film starts there, so
  strict fill-only would never let TMDB or MAL mark it released; the fills write
  when the status is blank or `Not Released` and only ever move it forward.
- **`Watch When Released` is the film types' spelling of `Watch When Airs`**, a
  separate stored value. Rejected: one status relabelled per type in the UI —
  the stored value would not say what the viewer sees, and the sheet would carry
  a word no page shows.
- **An ONA's one release date is held in both columns**, kept equal on every
  write by `sync_ona_release_date`. Rejected: storing it in JP only and teaching
  every reader of `release_date_tw` about ONA.
- **`release_type` is NOT NULL, default `Cinema`.** MAL's type sets it on the Add
  form only; a saved entry's fill never writes it. Rejected: a nullable "not
  chosen yet", which every reader would have to treat as Cinema.
- **Movie's "Original Source" is labelled "Exclusive Source" only.** Moving
  movies to the single-valued exclusive-source field had no lossless mapping for
  a movie with several sources.
- **Releasing a film starts watching it for the acting viewer only**, through
  `/api/me/list`. Fill and a plain edit of `release_status` move nothing: they
  are not a person saying "it is out and I am watching it".
- **A game copy's sale price and hours are records, not inputs.** Nothing rolls
  them up or reads them in statistics.
- **"Play Order" is a label, not a feature.** A game's watch-order follow panel
  says Play Order; one model, route and editor serve every type.
