# Characters are searched on the search page only, by opt-in

`GET /api/search/` adds the `character` bucket only when asked
(`characters=true`), and only the `/search` page asks.

- **Opt-in, not a default bucket.** The nav dropdown shares the endpoint; a
  query there is usually about a title, and character names recur across
  unrelated works on purpose, so a default bucket would spend the dropdown's
  few rows on the weakest answers.
- **One request, not a second call to `/api/character/`.** The bucket is one
  query plus three decoration queries for the whole bucket, built by the same
  `character_responses` helper the character list uses, so a search card and a
  library card cannot disagree. The list endpoint would mean a second request,
  raw `ILIKE` matching instead of the search normalisation, and no `limit`.
- **Not a scope**: the scope selector is the dropdown's, and the dropdown has
  no characters.
- **Character names only**; identities are reached from their character's
  page.
- **The same visibility as the list**, through `apply_shared_visibility`.
