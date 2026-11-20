# A link the system acts on is a column; a displayed link is a source row

- **The rule:** a link the system *acts on* is a column; a link that is only
  ever *displayed* is a `media_source` row.
- By that rule `mal_link`, `imdb_link`, `comicvine_link` and their `*_id`
  partners stay columns — `derivation.py` parses ids out of them, the Fill
  pipeline keys on them, and `checking.py` and `calculation.py` gate on their
  presence. Official sites and social links are rows: autofill writes them and
  nothing reads them.
- **Rejected: moving the id-bearing links into the polymorphic table** so
  everything lives in one place. The Fill pipeline would then have to find its
  own key through a join, which is strictly worse than a column.
- The Sources card composing from two places is accepted, because the split is
  principled rather than historical.
