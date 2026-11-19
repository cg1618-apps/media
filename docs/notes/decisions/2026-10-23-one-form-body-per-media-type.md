# One form body per media type, laid out like the detail page

- **One body per type, so Add and Modify cannot drift.**
  `pages/add-tabs/<Type>AddTab.jsx` exports `<Type>FormBody` and
  `<Type>LineageFields`; the Modify tab imports them. A field exists on both
  pages or on neither, and `pages/add-tabs/FormLayout.test.jsx` asserts the two
  pages label the same fields in the same order.
- **The differences live in the wrappers.** The Add wrapper adds the auto-fill
  and external search boxes; the Modify wrapper adds Structured Notes.
  Validation, duplicate checks, enrichment and starting state stay in
  `Add.jsx` / `Modify.jsx`. Inside a body, `ownerId` (absent on Add) is the
  only difference, and it only says which entry the pickers belong to.
- **Rejected: a mode flag in the bodies.** `mode="add" | "modify"` would let
  each page grow its own fields again behind a conditional — the drift this
  removes, only harder to see. `ownerId` carries data and changes no layout.
- **The section order mirrors the detail page**, with the same titles and
  icons on every type: what the editor reads on the entry is where they edit
  it.
