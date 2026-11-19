# The tab title is the page's name, and a detail page's contents are read from the page

- **One writer of `document.title`.** `PageTitleProvider` in `Layout` owns it;
  pages name themselves through `usePageTitle`. Rejected: a `document.title =`
  effect in each page, which nothing keeps consistent, and a title field on
  every `<Route>`, which cannot know a record's name and would be a third list
  of pages beside the routes and the nav.
- **Ordinary pages take the nav's label** from `navigation.js`, so the tab and
  the menu cannot disagree; a library row adds "Library".
- **No site suffix.**
- **The loading and error fallback is the nav row the path lights up.**
  Rejected: "Loading…" and "Not found" titles, which say nothing about where
  the tab is, and the site name, which makes every half-loaded tab look the
  same.
- **The detail-page contents are discovered, not declared.** Which sections a
  detail page renders turns on the viewer, the data and the notes registry;
  writing those conditions again per page would let the list and the page
  disagree, so `DetailContents` reads `data-toc` anchors off the rendered tree
  (with a `MutationObserver` for the notes). The dashboard keeps a declared
  list: it already computes which divisions it draws.
- **On the right, xl+ only, with the page widened to make room**, since the
  left column already holds sticky content.
