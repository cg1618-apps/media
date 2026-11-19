# One role vocabulary, and every person role carries a scope

- **One role vocabulary** shared by credits and people: `director`,
  `producer`, `composer`, `author`, `illustrator` (plus the roles added since).
  Labels that vary by media type are **derived, not stored** — `author` renders
  原作 / Author / Writer.
- **Rejected: a separate vocabulary for `media_credit.role`** mapped onto
  `(person_role, scope)` in code. The two-vocabulary split would survive in the
  stored data and every reader would need the map.
- **Every `person_role` row carries a scope, and `scope` is NOT NULL.** There
  is deliberately no unscoped "offered everywhere" state — the opposite of
  `system_option_scope`, and the difference is the point. Under "zero scopes
  means everywhere", the *first* scope row flips a value's meaning from every
  media type to one, which is why tags may not be auto-scoped. Person credits
  *are* auto-scoped, so removing the "everywhere" state makes auto-scoping
  purely additive and that trap structurally impossible. The cost is two
  similarly named `scope` columns meaning different things, commented on
  `PersonRole`.
- **A credit write sets both role and scope.** Crediting 原作 on a manga gives
  the person `(author, manga)`, so a director arriving through Fill or Pull
  appears in the picker without anyone visiting a form.
- **An ambiguous name raises rather than picking a winner.** `_find_by_name`
  returns None on no match, the row on one, and raises on two or more.
  `resolve_person` is find-or-create on every automated write path, so a false
  match would silently attach one person's credits to another. Rejected:
  narrowing which name columns are searched — the Sheets round trip needs a
  display name written from any column to resolve back. Raising turns a silent
  wrong match into a visible per-row failure naming both candidates. Studios
  and publishers inherit the same behaviour through the same function.
