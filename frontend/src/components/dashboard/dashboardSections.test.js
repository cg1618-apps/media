// Which dashboard parts a permission set opens. Each refusal has its mirror:
// the same set with the one deciding key added or removed.
import { dashboardSections, holdsAnyMediaType, isAdminDashboard } from "./dashboardSections";

function auth(permissions) {
  const held = new Set(permissions);
  return { permissions, has: (p) => held.has(p) };
}

describe("isAdminDashboard", () => {
  it("is true for admin.authz with no media_type.* key", () => {
    expect(isAdminDashboard(auth(["admin.authz", "manage.pipelines"]))).toBe(true);
  });
  it("is false once any media_type.* key is held", () => {
    expect(isAdminDashboard(auth(["admin.authz", "media_type.game"]))).toBe(false);
  });
  it("is false without admin.authz", () => {
    expect(isAdminDashboard(auth(["manage.pipelines"]))).toBe(false);
  });
});

it("holdsAnyMediaType matches the prefix only", () => {
  expect(holdsAnyMediaType(["view.media_type"])).toBe(false);
  expect(holdsAnyMediaType(["media_type.anime"])).toBe(true);
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
