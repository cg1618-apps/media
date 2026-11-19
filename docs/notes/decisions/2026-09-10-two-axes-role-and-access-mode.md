# Two axes: the role says what you may do, the mode which objects you reach

The gates as they behave are `authorization.md`; this is why they have that
shape.

- **Two axes that answer different questions.** The **role** answers *what
  kinds of operation may this account perform*; the **access mode** answers
  *which objects those operations reach in this session*. They must not be one
  knob: if they were, dropping to `safe` would also drop editing rights.
- **Object-scoping vocabulary is not grantable to a role.** Content labels and
  field groups are what a mode carries, never a role grant. They *must* be off
  the role axis: **permission resolution is a union, and a union can only
  add**, so a label grantable on a role could never be taken away by a mode
  and the narrow modes would be unbuildable.
- **A mode never changes which kinds of operation an account may perform.** It
  scopes two vocabularies: content labels (whether an entry exists for you at
  all) and field groups (which columns of a reachable entry you see).
- **Narrowing is instant; widening asks for the password again**, so a browser
  left at `safe` is actually safe. A session starts in the account's default,
  not the narrowest: always landing narrow would make the widening prompt
  routine, and a prompt typed through by reflex has stopped being a control.
- **A per-account adjustment can only remove; a mode is a ceiling.** So a mode
  name on the user list is a trustworthy upper bound.
- **Writes follow reads, against the ACTIVE mode.** If `GET` answers 404 for
  you, every write to that id answers 404 too. Rejected: binding writes to the
  account's ceiling, which would have the server 404 a `GET` and then accept a
  `PUT` for the same id. Postgres RLS applies one `USING` clause to `SELECT`
  and `UPDATE` alike, and OWASP ranks the inverse as API1:2023, Broken Object
  Level Authorization.
- **401 and 404, never 403.** `401` means *you may not do this kind of thing*;
  `404` means *this object is not yours to see*, the same answer a genuinely
  absent row gets — **because a 403 confirms the row exists exactly as surely
  as a 200 does.**
- **Pull restores the authorization tabs only for `admin.authz`.** The sheet is
  editable by anyone with Google access, so without the check a catalogue
  editor could type `admin` into the Users tab and Pull themselves a
  promotion. Those tabs are skipped and reported; every other tab restores.
  Rejected: requiring `admin.authz` for the whole pipeline, which would stop a
  helper restoring the catalogue after a bad import. Backup (database to
  sheet) is not an escalation path and is unrestricted.
- **`media_type.*` stays on the role axis**, the one arguable boundary. "May I
  see Games" is object-shaped, but it says what an account is *for* rather
  than how careful this session is being.
- **The guest mode is `safe`, resolved by key.** Rejected: an
  `is_guest_default` flag on the mode. The objection to a key lookup — editing
  `safe` republishes to the internet — is equally true of the flag, and a
  column is something a Pull, a migration or a hand-edit can move to
  `unrestricted`, publishing every labelled entry while looking like a
  successful restore. The live risk is stated rather than designed around:
  widening `safe` widens what the internet sees, immediately.
- **A logged-out visitor gets no mode switcher at all**, not a disabled one, so
  other modes are never advertised to anonymous visitors.
