# A shared account's mode is a ceiling and a default; a login lands on the dashboard

- **A shared account's mode is set like any account's.** Fixing it assumed one
  person narrowing would narrow everyone on the login, but a switched mode is
  one browser's `access_mode` cookie and never reaches the others. The real
  consequence of switching is the opposite: anyone with the shared password can
  widen to the ceiling, for up to an hour. So the ceiling is what the admin
  hands out with the password, set on `/users`. The shared *role* stays fixed,
  and the seed puts back a mode only on an account left with none.
- **A login always lands on `/`; there is no `?next=`.** Sending a login to the
  page the previous visitor was on breaks whenever the new account may not open
  it. The dashboard is the one page every account can open. A mode switch is not
  a login and still reloads the page it is on.
- **The Users page edits in one dialog**, saved together, sending only what
  changed; no tick saves at once.
