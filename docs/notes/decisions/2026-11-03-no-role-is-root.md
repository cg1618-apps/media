# No role is root, and the object axis applies to every viewer

No role short-circuits a permission check. The admin role stores its fixed
grants as rows (`ADMIN_FIXED_PERMISSIONS`), its whole row locked.

- **A permission minted later reaches nobody until it is granted.** A root
  short-circuit means a new label or media type never hides anything from the
  administrator — and that every new capability reaches the most powerful login
  by default, without anyone deciding it should. A later feature reaches the
  admin only by an edit to the fixed set.
- **The admin holds no catalogue, so there is nothing to exempt.** It holds no
  `media_type.*`, no `view.*` and no mode, so it resolves the empty object set.
  An exemption from the object axis would exempt a viewer that sees nothing
  from the filter that says so — a leak waiting for its first bug.
- **No mode is enforced at boot**, not only at migration
  (`ensure_admin_accounts_modeless`), because a Pull restores the Users tab as
  the sheet says.
- **"Holds no user data" is the admin's locked row**, not a carve-out from a
  short-circuit.
- **Nobody edits another account's personal note**, the admin included:
  `DELETE` asks what `PATCH` asks.
- **Deleting the admin account is an explicit 409**, not a last-admin count:
  with fixed roles the count could only ever be the one account.
- **What the admin gives up.** It cannot see what a restriction does by
  looking; the label reference's counts cover that, and "preview as an account
  or mode" is the remedy if that is ever not enough.
