# Admin pages load per tab, and what was deliberately not done

The Add, Modify and Delete pages fetch the entry list of the tab being shown
(`hooks/useEntryLists.js`, `config/adminEntryLists.js`), in one wave with the
form defaults and suggestion sources, and paint when the sources land.

- **Credit counts are computed for a whole list in one pass**
  (`credits.credit_counts()`): visibility is resolved once for every pair on
  the page. `tests/api/test_credit_counts_are_batched.py` asserts the query
  count, not only the numbers — an N+1 produces the same numbers, just slowly.
- **The auto-fill box is disabled until its own list is in**, rather than
  answering "no matches": on an Add page that is the wrong answer to give
  someone about to create a duplicate.
- **Rejected: a `?fields=` projection on the list endpoints.** List responses
  end in a per-viewer field gate, and a projection that let a caller name a
  field the gate would have stripped is a permission leak wearing a
  performance costume. Pointing the typeahead at the existing `search_query`
  parameter is the cheaper thing to try first if this is ever revisited.
- **Delete waits for every list before offering to delete a now-empty
  franchise or series.** An unfetched list reads as empty, which would offer
  to delete a franchise that still holds entries.
- **The group tabs ask the server what a group holds** (`useGroupMembers`),
  filtering each type's list by `franchise_id` / `series_id`, re-checking the
  parent id on every row returned, and the cascade deletes exactly that set,
  stopping at the first failure. Fetching every list on selection would also
  be correct, at about 4 MB per selection.
