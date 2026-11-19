# No admin-role account is the installation owner

The installation owner is whose collection a restore or a pipeline files rows
under, and the admin keeps no personal data, so the flag and the admin role
never meet on one account. Without a flag holder the owner is the first
`active` account by username whose role is not `admin`, `guest` or `shared`,
and otherwise nobody: a restore with no owner skips the owner-dependent rows and
names them rather than filing someone's library under an account that keeps
none.

- **Guarded where the flag is written, not with a constraint.** A CHECK across
  `users` and `role` needs a trigger or a denormalised role name — a migration
  for a state only a hand edit or an old sheet can produce. The writers are
  few: `/api/users`, Pull's Users tab and boot.
- **Pull drops the flag from an admin row and restores the rest**, reported,
  rather than skipping the row and leaving its other columns stale for a fault
  in one cell. Making room for the sheet's flag holder spares the row's own
  account, so an ordinary Backup-then-Pull keeps the owner.
- **Boot clears a flag a hand edit left on an admin account**
  (`ensure_no_admin_installation_owner`).
- **`installation_owner_id()` passes an admin flag holder over** too: it is the
  one place every restore and pipeline asks, and "never the admin" is its
  contract.
- **Revisions that moved personal data keep their frozen owner query** as
  shipped: a revision keeps meaning what it meant when it ran.
