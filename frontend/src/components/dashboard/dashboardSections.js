// Frontend: which parts of the dashboard (/) a viewer is shown.
//
// The dashboard differs per viewer (docs/viewers.md, "Dashboard"), and every
// choice here is made on permissions, never on the role's name, so a role
// edited on /roles gets the dashboard its permissions describe:
//
//   adminPage      admin.authz and no media_type.* key - a viewer that runs
//                  the installation and reads no catalogue. It gets its own
//                  page instead of the catalogue dashboard, which would only
//                  fetch lists it is refused.
//   tracker        self.list - the viewer's own watch schedule, Coming Next,
//                  followed orders and the Watching, Reading and Playing
//                  divisions.
//   summary        self.list and manage.requests - what waits for a handler,
//                  on a member's dashboard. The admin page draws its own.
//   libraryLinks   no self.list - a way into each library, for a viewer with
//                  no tracker to start from.
//   recentlyAdded  view.random_picker without self.list - the shared
//                  account's newest entries.

const MEDIA_TYPE_PREFIX = "media_type.";

/** True when the viewer's permissions include any media_type.* key. */
export function holdsAnyMediaType(permissions = []) {
  return permissions.some((p) => p.startsWith(MEDIA_TYPE_PREFIX));
}

/** True when `/` shows this viewer the admin's own page. */
export function isAdminDashboard(auth) {
  return auth.has("admin.authz") && !holdsAnyMediaType(auth.permissions);
}

/** The catalogue dashboard's optional parts for this viewer. */
export function dashboardSections(auth) {
  const { has } = auth;
  const isMember = has("self.list");
  return {
    tracker: isMember,
    summary: isMember && has("manage.requests"),
    libraryLinks: !isMember,
    recentlyAdded: !isMember && has("view.random_picker"),
  };
}
