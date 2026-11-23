# A person role may be held with no scope, and some scopes are not credit fields

- **`person_role.scope` is nullable, and NULL means offered nowhere.** An
  illustrator added before their first credit, or one whose work is not
  catalogued yet, is still an illustrator: listed under the type in the
  library and on the admin sub-tab, offered in no entry's dropdown. Forcing a
  media type made the form default to whichever came first (`manga`), which
  filed people under a type they never worked in. NULL cannot mean
  "everywhere" - that is the state the 2026-09-04 decision removed, and it
  still binds: auto-scoping on a credit write stays purely additive.
- **Per role, one unscoped row or only scoped ones.** Once a role has a scope
  the unscoped row says nothing more, so every writer (the form, a credit, a
  MAL cast import, a merge) drops it through `person_roles.py`. Rejected:
  letting both coexist - harmless to the dropdowns, but the form could not
  draw it and a merge would carry the redundant row forward.
- **For every role, not just illustrator.** The same reasoning holds for a
  director or a composer, and one rule is easier to read than a per-role list.
  The exception is `club` (`scope_required`): its only scope is the gated
  h-comic, and an unscoped club names no type for a narrow session to hide it
  behind.
- **`extra_scopes` are legal scopes that are not credit fields.** Composer,
  director and producer may be filed under movie, TV show, cartoon and anime
  movie before any of those types carries the credit. Rejected: adding the
  types to `CreditRole.media_types`, which `credit_roles_for` reads, so the
  entry forms, `/api/credits` and the sheet link columns would all have
  gained a field the types do not have.
