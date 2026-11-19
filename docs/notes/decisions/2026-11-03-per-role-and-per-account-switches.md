# Per-role permissions and per-account feature switches

- **One entity-page key per kind** — `view.studio`, `view.publisher`,
  `view.person`, `view.character` — so each kind of entity page opens or closes
  on its own. `person` covers the seiyuu library (a seiyuu opens a person page)
  and `character` covers identities; separate keys for those would only ever be
  set "same as the other one".
- **Carrying an old key onto new ones keeps what everybody sees.** A revision
  that splits a permission grants the new keys to every role that held the old
  one; "off by default" is the seed's rule for databases built afterwards.
  Switching pages off on deploy would be a behaviour change smuggled into a
  refactor of the permission's shape.
- **The gated types are locked grants, not free.** The label is what actually
  hides a gated type, so a free grant made the role editor offer a box whose
  ticking did nothing visible. Locked on for `user` and `super` and off for
  `guest` and `shared`, the grant states what is meant. The ordinary types stay
  free.
- **Feature switches are columns on `users`, not a feature table.** A feature
  is a setting on one account, like the mode ceiling and the request limit, and
  rides the Users tab with them; a table would need a tab of its own, and a Pull
  that skipped it would switch every feature off on the arriving machine. A
  sheet that predates a column leaves the local value alone.
- **The role is asked as well as the column.** `PATCH /api/users/{id}` refuses
  a feature on anything but `user` or `super`, but a Pull restores what the
  sheet says, so `held_features` counts a column only on those roles.
- **Search drops a bucket's key rather than sending it empty.** An empty list
  says the type exists and reads as "nothing matched". A media type the role
  does not hold, or an entity kind without its key, has no key in `results`;
  each such bucket defaults to `None` and is dropped on serialising, so a type
  added later cannot put its key back with a default of `[]`.
