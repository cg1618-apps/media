# The admin's pages get their own `manage.*` keys, not `manage.catalog`

Announcements, the Note pages (System Options, Alias Conversion, External
APIs), `/images` and `/resources` are gated on `manage.announcements`,
`manage.options`, `manage.images` and `manage.resources`
(`ADMIN_PAGE_PERMISSIONS`).

- **`manage.catalog` is catalogue WRITE, and the admin writes no catalogue
  row.** Granting it for these pages would hand the admin every entry, group,
  person, credit and catalogue note write — creating an entry needs no
  visibility, so even the empty object set would not stop it.
- **`manage.catalog` also drives `/me`'s `is_admin`**, which the SPA reads as
  "may edit the catalogue" and draws edit controls on. Keeping the key off
  keeps `is_admin` meaning what its readers think: true for `super`, false for
  the admin.
- **`manage.resources` gates reads as well as writes**: the site-wide Resources
  page is the admin's and super's only.
- **Form and picker defaults stay on `manage.catalog`**: they shape how
  catalogue rows are written.
- **`super` holds all four by lock; `user`, `guest` and `shared` never do.**
