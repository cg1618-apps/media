# The nav search dropdown: eight rows, a hue per type, closed by a search

- **Eight rows, not twenty.** The dropdown is a shortcut to the likely row;
  `/search` is the result list. Every title type gets a floor of one row and
  the staff types none, so the first pass shows as many types as fit and the
  round-robin hands out the rest. **Exact matches are taken inside the merge**,
  every bucket's first: lifted after the cap, a whole-title hit in a late
  bucket would be cut before it could be lifted.
- **A late response cannot reopen it.** Enter, a result click and an emptied
  input move the request id on as well as clearing the debounce
  (`cancelPendingSearch`), so an answer already in flight is discarded by the
  stale-response check. Aborting the fetch was not added: it would be a second
  mechanism for the same job.
- **The type badge's colour is a sanctioned exception to design rule 5.** The
  dropdown mixes up to nineteen types in eight rows that are scanned, not read,
  while the reader is still typing; hue finds the row of the type they meant
  before the label is read. The label stays in the chip, so colour is never the
  only signal.
- **Media types reuse their scope hue**, so a type has one colour wherever it
  is coloured; `config/scopeColors.js` holds them as `TYPE_HUES`. Grouping
  tiers take saturated hues in the gaps; people, studios and publishers take
  low-saturation hues, so a credited entity reads as "not a title" first. Every
  value clears WCAG AA on `--c-surface`.
- **Rejected:** an ad-hoc colour map in `NavSearch.jsx` (two homes for one
  type's colour), and colouring the `/search` page too, whose rows sit under
  per-type headings so the type is already given by position.
