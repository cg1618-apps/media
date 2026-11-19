# A new auto-fill default is added to stored auto-fill lists too

When a field joins `BUILTIN_AUTOFILL` (as `mal_link` on h-comic and hentai and
`anidb_link` on hentai did — entries of one franchise often share those pages),
the revision that adds it also adds it to every stored auto-fill list.

- **A stored list is used verbatim**, and `/defaults` saves it whole, so a type
  configured before the change would otherwise never copy the new field.
- **Rejected: leaving stored lists alone.** The new default would reach only
  unconfigured types, and nothing on `/defaults` would explain why.
- **Rejected: treating absent keys as "on".** An editor who unticked a field
  could not be told apart from one who never saw it.
- A list saved earlier could not have chosen the field, because `/defaults` did
  not offer it, so adding it overrides no decision. A null list already means
  the built-in set.
- Hidden ids are not copied: the write hook derives them from the links again.
