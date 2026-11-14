// Which dashboard parts a permission set opens. Each refusal has its mirror:
// the same set with the one deciding key added or removed.
import { dashboardSections, isAdminDashboard } from "./dashboardSections";

// The admin's fixed set: every key it holds, and no library media type.
const ADMIN_KEYS = [
  "admin.authz",
  "manage.pipelines",
  "manage.requests",
  "manage.announcements",
  "manage.options",
  "manage.images",
  "manage.resources",
];

function auth(permissions) {
  const held = new Set(permissions);
  return { permissions, has: (p) => held.has(p) };
}

describe("isAdminDashboard", () => {
  it("is true for the admin's seven keys, which read no library", () => {
    expect(isAdminDashboard(auth(ADMIN_KEYS))).toBe(true);
  });
  it("is false for the same keys plus one library media type", () => {
    expect(isAdminDashboard(auth([...ADMIN_KEYS, "media_type.anime"]))).toBe(false);
  });
  it("is false without admin.authz", () => {
    const withoutAuthz = ADMIN_KEYS.filter((k) => k !== "admin.authz");
    expect(isAdminDashboard(auth(withoutAuthz))).toBe(false);
  });
});

describe("dashboardSections", () => {
  it("super: tracker and summary, no library links or recent", () => {
    expect(dashboardSections(auth(["self.list", "manage.requests"]))).toEqual({
      tracker: true,
      summary: true,
      libraryLinks: false,
      recentlyAdded: false,
    });
  });
  it("user: tracker only", () => {
    expect(dashboardSections(auth(["self.list", "view.random_picker"]))).toEqual({
      tracker: true,
      summary: false,
      libraryLinks: false,
      recentlyAdded: false,
    });
  });
  it("shared: library links and recently added", () => {
    expect(dashboardSections(auth(["view.random_picker"]))).toEqual({
      tracker: false,
      summary: false,
      libraryLinks: true,
      recentlyAdded: true,
    });
  });
  it("guest: library links only", () => {
    expect(dashboardSections(auth(["view.search"]))).toEqual({
      tracker: false,
      summary: false,
      libraryLinks: true,
      recentlyAdded: false,
    });
  });
});
