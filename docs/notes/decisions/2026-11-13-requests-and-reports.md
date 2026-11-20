# Requests and reports: two permissions, and the owner's answers

The behaviour is `systems/requests.md`.

- **Filing is `self.requests`; handling is `manage.requests`.** Filing is
  ownership of your own rows, so it belongs in the `self.*` family, which the
  admin and guests do not hold; handling is a capability like
  `manage.catalog`. "Not guests, not the admin" holds by construction rather
  than by a check in every route.
- **The table is `user_request`, not `request`**, because `fastapi.Request` is
  imported across the routers.
- **The target is an FK-less `(type, id)` pair with the name stored at filing
  time**, the convention quotes and memes use, so a deleted entry still reads as
  what it was. The author is `ON DELETE SET NULL`.
- **Requests do not travel on Sheets.** They are messages to the production
  site; the box's dump holds them, and a Pull would otherwise overwrite the
  box's inbox with a development machine's. **The open-request limit does
  travel** on the Users tab: it is an account setting, and a Pull must not reset
  it.
- **A role change resets the limit to the new role's default**, unless the same
  save sets the limit. `super`'s "no limit" is fixed and never stored.
- **A handler can reopen a closed request**, so one closed by mistake is not
  stuck. **The filer sees the handler's response**, because a decline with no
  reason reads as a brush-off (`SHOW_RESPONSE_TO_FILER`).
- **"Report a problem" sits at the end of the breadcrumb row**, because the
  header action row is drawn only for editors. Provisional, pending the owner's
  design.
