# Exactly five fixed roles, and the shared accounts

The roles are `admin`, `super`, `user`, `guest` and `shared`
(`permissions.ROLE_NAMES`); none can be created or deleted.

- **Custom roles are abandoned.** With five fixed roles plus per-role and
  per-account switches, a custom role adds nothing but something more to
  secure. Every rule that had to say "and a custom role decides this freely"
  was a hole in a lock table, and the lock table is the thing being secured.
- **A name outside the five gets everything locked off**: a lock table must not
  hand a stranger anything.
- **A migration that meets an account on an unknown role refuses rather than
  reassigns.** Which role a person moves to is a decision about people, and a
  deploy has no business guessing it.
- **`shared` is its own role, not `guest`.** A guest is the signed-out visitor
  and nobody else; a shared account is signed in. Separate roles let what
  visitors read and what shared logins read be tuned apart.
- **The shared accounts come from the lifespan seed**, as the roles do, because
  the API tests build their schema with `create_all` and never run Alembic.
  Each boot re-creates a missing shared account and puts its role back to
  `shared`: "fixed" has to survive what the API cannot stop — a Pull restoring
  the Users tab, a hand edit in the database. The password, status, mode and
  request limit are the admin's, so the seed leaves them alone.
- **No shared password in `.env` or the code.** A new shared account gets an
  unusable hash, and the admin sets the password on `/users` when handing it
  out.
- **`user` never writes the catalogue**, locked off: writing the catalogue is
  what makes an account `super`.
- **`/users` refuses each fixed thing explicitly** — an account is created in or
  moved to `user` or `super` only (422); the admin's and a shared account's role
  are 409 with a sentence naming which; a shared account cannot be deleted
  (disabling is allowed).
- **Only `admin` and `guest` are reserved in usernames**, tested as a substring
  of the lowercased name. `shared` is not reserved: the shared accounts are
  seeded, never registered, so no registrant can collide with them.
