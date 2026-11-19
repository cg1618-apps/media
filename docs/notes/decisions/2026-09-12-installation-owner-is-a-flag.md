# The installation owner is a flag, and having a library is not a privilege

The rule as it stands is `authorization.md`, "The admin account holds no user
data".

- **The installation owner is a flag on the user row**, with a partial unique
  index so at most one account holds it. Rejected: an environment variable —
  it is per-machine, so the two databases could silently disagree about who
  owns the collection, which is the drift the Sheets round trip exists to
  prevent. Rejected: a heuristic over roles, ambiguous the moment a third
  account exists.
- The flag rides the Sheets `Users` tab, and `parse_user_from_sheet` is an
  **explicit projection, not a column sweep**, so the column has to be named
  there or it does not travel.
- **`self.*` is ownership, not privilege.** "May administer the system" and
  "has a personal library" are different claims, and conflating them is what
  put user data on the admin account. It is expressed as one condition in the
  permission model rather than as refusals scattered through the write routes
  — a rule spelled out in twenty routers is missing from the twenty-first.
- **Authorship is not ownership.** `author_id` records who wrote a row, not who
  owns it. The admin authors catalogue rows (quotes, memes, catalogue notes
  are catalogue writes); it owns no personal rows.
- **No admin-role account is the owner.** See
  `2026-11-14-no-admin-is-the-installation-owner.md`.
