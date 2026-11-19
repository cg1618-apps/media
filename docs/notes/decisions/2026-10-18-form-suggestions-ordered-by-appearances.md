# Form suggestions are ordered by appearances on the form's media type

The Add and Modify forms offer people, studios, publishers and the genre and
label vocabularies most-used first (`GET /api/credits/usage`).

- **"Appearances" is the number of entries of the form's media type using the
  value, among those the viewer can see.** Per type, because the studio most
  used on hentai is not the one an anime form wants first. Entries rather than
  rows, so a value used twice on one entry counts once. People are counted per
  role, because a person picker is per role. Hidden entries are left out, so a
  narrow mode cannot learn from an order what it cannot read.
- **Only the genre and label vocabularies are reordered.** Platforms, imprints,
  themes and modes keep their curated `sort_order`; reordering them by use
  would discard that ordering unasked.
- **One endpoint for every type at once**: two `GROUP BY` queries plus the
  hidden-label lookup, so the cost does not grow with the number of values; the
  forms sort client-side. A separate endpoint rather than a parameter on the
  list endpoints, because other pages read those lists in their own order and
  one form's counts come from several lists.
- **A studio's scope is read from the counts, and only for the empty box.**
  Studios have no declared scope, so "in scope" means credited on a visible
  entry of the type; typed text still searches every studio, so one new to the
  type is reachable. Publishers and people keep their stricter, declared scope,
  because that scope is an editor's statement, not an inference from history.
