# Every note link is a titled pair

- **One link shape, everywhere.** Every `links` column holds `{"text", "url"}`
  pairs with an optional title. URL strings on most sections and pairs on a
  few meant two editors, two validators and a per-section flag every reader
  had to consult; `takes_links` now says only whether a section has links.
- **A bare URL string in a request is accepted and read as an untitled link**,
  rather than refused, so a page still running the older bundle during a
  deploy does not fail every save. The stored shape is only pairs.
- **A section losing a field keeps its data in a field it still has.** Text in
  a column no field claims is invisible and turns the row's next edit into a
  422, so a reshape folds it into what the section still draws — links
  appended to the description as `title: url` lines, a description into a
  title — or moves the row to the same owner's catch-all section. Refusing the
  migration would freeze a deploy over a row that can be kept.
- **A Pull from an older sheet is reshaped the same way**, not only
  link-converted, or it would restore data into columns the sections no longer
  draw. Each step is a no-op on a row already in the new shape.
