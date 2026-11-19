# One test decides a page's catalogue version, and the two versions are separate components

Every page that differs for a viewer without a list — libraries, cards, detail
pages, Seasonal, Statistics, the Random Picker, Future Releases, the dashboard —
asks one question, `has("self.list")` (`useViewScope().ownData`), and nothing
else. A test per page on role names or a mixture of keys is how the SPA
drifted: one control asked `isAdmin`, the next `self.list`, and a `user` was
shown buttons that answered 401.

- **Whether a page opens is a different question** from what it shows. Pages
  open on whether the viewer reads the catalogue (or their own `view.*` key);
  what they show is decided by the list.
- **The Explore pages draw two components, chosen once at the top.** The list
  version reads per-user routes that refuse a viewer without a list. A
  component that branches inside would still mount those queries or need a
  guard on each, and one missed guard is an error banner for a guest; a
  catalogue component never names them, and a test asserts each is never
  fetched.
- **Catalogue aggregates are computed server-side**
  (`GET /api/statistics/catalogue`), over the viewer's visible object set, so a
  viewer without a list downloads no lists and a mode never learns from a total
  what it hides.
- **Personal filters and weights are flagged, not listed per call**
  (`personal: true` on a FilterDef, `WEIGHT_INPUTS`), so the picker and the
  library drop the same filters.
- **A shown external score is a catalogue fact**, so filtering on it is offered
  with and without a list.
- **Watch orders and the relations graph answer a hidden owning group as
  missing**, so an order owned by a hidden group does not leak its name to the
  pages opened to more viewers.
