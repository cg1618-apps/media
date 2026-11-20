# A switch to a wider mode lasts an hour, or until the browser closes

- **The problem it solves.** The login lasts 30 days in a persistent cookie.
  The widening password protects the act of switching up; nothing protected a
  device *left* switched up.
- **Two cookies.** The login cookie says who is asking; `access_mode` says which
  mode they switched to. A request with no live override resolves the
  account's default from the database.
- **Both limits, not either.** A browser-session cookie alone fails in a
  browser that restores its session on startup, or is never closed; a timer
  alone survives closing the browser. The override is a session cookie whose
  token expires `access_mode_override_minutes` (60) after the switch, capped at
  the login's own expiry.
- **Fixed, not sliding.** The hour runs from the switch, so a page that polls
  does not keep a session wide.
- **Only a mode wider than the default expires.** Narrowing on purpose —
  dropping to `safe` with someone watching — must not be undone behind its
  owner's back. "Wider than the default" is the password prompt's subset test,
  so no ranking of modes is needed; a mode neither wider nor narrower counts as
  wider and is timed, the conservative side. The override token carries
  `timed`, so `/me` reports no end for an untimed one rather than a date a
  month out (which would also overflow `setTimeout`).
- **Rejected: a separate setting for how long a narrower mode lasts.** One knob
  means "how long a wider mode lasts".
- **A revoked override resolves to nothing**, not to the default, until it
  expires.
