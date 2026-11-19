# The dashboard is chosen per viewer, on permissions

One `Index` picks its parts in `components/dashboard/dashboardSections.js`, and
every pick is a permission, never a role name, so a role edited on `/roles` gets
the dashboard its permissions describe.

- **The admin's dashboard is "`admin.authz` and no library media type".** What
  makes it necessary is that the admin reads no catalogue; a role holding both
  would be shown the catalogue dashboard. "Reads the catalogue" is the question
  the Library tab already asks, so the dashboard and the header cannot
  disagree.
- **Nothing is chosen before `/me` answers.** Until then every viewer looks like
  a guest, and the admin would fire catalogue reads that answer 401.
- **The library links are the nav's rows**, from `visibleSections`, so a
  library the header hides is never linked and a new library appears on both
  at once.
- **A line is a link only where the reader can act.** Super's
  pending-registrations line names who approves rather than linking to a panel
  super is not shown.
- **One announcement editor** (`AnnouncementEditor`), drawn on the admin's
  dashboard and on `/system`, over one query; two editors would drift.
