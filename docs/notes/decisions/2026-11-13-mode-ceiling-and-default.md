# An account has a mode ceiling and a default, not a held mode set

- **A ceiling and a default.** The modes are ordered `safe < normal <
  borderline < unrestricted` (`MODE_ORDER`); an account may use every mode at
  or below `users.mode_ceiling` and lands in `users.mode_default`. A held set
  could express a gap (`safe` and `borderline` without `normal`) nobody had a
  use for, and needed a partial unique index to keep the default inside it;
  the ceiling needs one CHECK.
- **Keys, not mode ids.** A key means the same on both machines, so the pair
  travels on the Users tab without being resolved; an id is minted per
  database.
- **Denials hang off the account and apply in every mode.** Lowering the
  ceiling deletes the denials it no longer shows, so a denial always names
  something the account could otherwise reach.
- **Which modes are available is a rank comparison; what a switch costs is the
  subset test on effective sets.** They differ only from the empty set, where
  moving to `safe` with its labels denied adds nothing.
- **A mode above the ceiling resolves the empty set.** Falling back to the
  default or the ceiling would let a lowered ceiling leave a session somewhere
  it was never put.
- **A new account starts at `normal` / `normal`** from the columns' default,
  so a Pull from a sheet that predates the columns lands there too.
- **A pair the constraints would refuse is skipped on Pull**, not allowed to
  roll the whole Users tab back; the row lands, its pair stays local and is
  reported.
