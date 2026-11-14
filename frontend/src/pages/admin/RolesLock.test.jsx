// Frontend: the boxes a role cannot change are drawn disabled.
//
// Which ones is served per role as locked_on / locked_off, from the same
// table PUT /api/roles/{id}/permissions enforces with a 409
// (app/services/rbac/permissions.py::locked_permissions) - so this page is
// the first of two stops rather than the only one. What it adds is that the
// invalid save cannot be asked for.
//
// Rendered rather than asserted through a pure helper: the thing that can be
// wrong here is an enabled checkbox, not a predicate.
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const EVERY = [
  "admin.authz",
  "manage.catalog",
  "manage.pipelines",
  "media_type.anime",
  "self.list",
];

const ROLES = [
  {
    system_id: "u",
    name: "user",
    label: "User",
    description: "A signed-in member.",
    permissions: ["media_type.anime", "self.list"],
    user_count: 1,
    locked_on: [],
    locked_off: ["admin.authz", "manage.pipelines"],
  },
  {
    system_id: "s",
    name: "super",
    label: "Super",
    description: "Everything but authorization.",
    permissions: EVERY.filter((p) => p !== "admin.authz"),
    user_count: 0,
    locked_on: EVERY.filter((p) => p !== "admin.authz"),
    locked_off: ["admin.authz"],
  },
  {
    system_id: "a",
    name: "admin",
    label: "Admin",
    description: "Runs the installation; reads no catalogue.",
    // Its fixed set, stored as rows like any other role's. Every cell is
    // locked: the fixed set on, everything else off.
    permissions: ["admin.authz", "manage.pipelines"],
    user_count: 1,
    locked_on: ["admin.authz", "manage.pipelines"],
    locked_off: EVERY.filter((p) => p !== "admin.authz" && p !== "manage.pipelines"),
  },
];

const CATALOG = [
  {
    family: "admin",
    label: "Administration",
    permissions: [
      { permission: "admin.authz", label: "Manage Authorization", description: null },
    ],
  },
  {
    family: "manage",
    label: "Management",
    permissions: [
      { permission: "manage.catalog", label: "Manage Catalogue", description: null },
      { permission: "manage.pipelines", label: "Run Pipelines", description: null },
    ],
  },
  {
    family: "media_type",
    label: "Media Types",
    permissions: [
      { permission: "media_type.anime", label: "Anime", description: null },
    ],
  },
  {
    family: "self",
    label: "Own Rows",
    permissions: [{ permission: "self.list", label: "Own List", description: null }],
  },
];

vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast: () => {} }),
}));

vi.mock("../../api/client", () => ({
  fetchJson: vi.fn((url) =>
    Promise.resolve(String(url).includes("catalog") ? CATALOG : ROLES),
  ),
  jsonBody: (body) => ({ body }),
}));

const { default: Roles } = await import("./Roles");

async function selectRole(label) {
  render(<Roles />);
  // getAll, not get: the page auto-selects the first role, so that one's name
  // is on screen twice - once in the list, once as the editor's heading.
  await screen.findAllByText(label);
  screen.getAllByText(label)[0].click();
}

function boxFor(name) {
  const label = screen.getByText(name).closest("label");
  return label.querySelector('input[type="checkbox"]');
}

describe("the Super role", () => {
  beforeEach(() => vi.clearAllMocks());

  it("draws every box disabled - nothing about it is a choice", async () => {
    await selectRole("Super");
    await waitFor(() => {
      const boxes = screen.getAllByRole("checkbox");
      expect(boxes.length).toBe(EVERY.length);
      expect(boxes.every((b) => b.disabled)).toBe(true);
    });
  });

  it("shows authorization clear and everything else ticked", async () => {
    await selectRole("Super");
    await waitFor(() => {
      expect(boxFor("Manage Authorization").checked).toBe(false);
      expect(boxFor("Run Pipelines").checked).toBe(true);
      expect(boxFor("Manage Catalogue").checked).toBe(true);
    });
  });

  it("offers no Save button", async () => {
    await selectRole("Super");
    await waitFor(() => expect(screen.queryByText("Save")).toBeNull());
  });
});

describe("the Admin role", () => {
  beforeEach(() => vi.clearAllMocks());

  it("draws every box disabled - nothing about it is a choice", async () => {
    await selectRole("Admin");
    await waitFor(() => {
      const boxes = screen.getAllByRole("checkbox");
      expect(boxes.length).toBe(EVERY.length);
      expect(boxes.every((b) => b.disabled)).toBe(true);
    });
  });

  it("shows its own keys ticked and unchangeable", async () => {
    await selectRole("Admin");
    await waitFor(() => {
      for (const name of ["Manage Authorization", "Run Pipelines"]) {
        expect(boxFor(name).checked).toBe(true);
        expect(boxFor(name).disabled).toBe(true);
      }
    });
  });

  it("shows the catalogue and Own Rows clear, because the admin holds neither", async () => {
    // Viewer.has() is plain membership: the admin holds no manage.catalog
    // and no self.*, so a ticked box here would state the opposite of what
    // the resolver does. The ticked boxes above are the mirror.
    await selectRole("Admin");
    await waitFor(() => {
      expect(boxFor("Manage Catalogue").checked).toBe(false);
      expect(boxFor("Manage Catalogue").disabled).toBe(true);
      expect(boxFor("Own List").checked).toBe(false);
      expect(boxFor("Own List").disabled).toBe(true);
    });
  });

  it("offers no Save button", async () => {
    await selectRole("Admin");
    await waitFor(() => expect(screen.queryByText("Save")).toBeNull());
  });
});

describe("the User role", () => {
  beforeEach(() => vi.clearAllMocks());

  // The mirror, same page and same fixtures: a green above proves the locks
  // did the disabling rather than every box on this page being disabled.
  it("lets the catalogue and own-rows boxes be changed", async () => {
    await selectRole("User");
    await waitFor(() => {
      expect(boxFor("Manage Catalogue").disabled).toBe(false);
      expect(boxFor("Own List").disabled).toBe(false);
      expect(boxFor("Anime").disabled).toBe(false);
    });
  });

  it("still refuses authorization and the pipelines", async () => {
    await selectRole("User");
    await waitFor(() => {
      expect(boxFor("Manage Authorization").disabled).toBe(true);
      expect(boxFor("Manage Authorization").checked).toBe(false);
      expect(boxFor("Run Pipelines").disabled).toBe(true);
    });
  });

  it("offers a Save button, since something is editable", async () => {
    await selectRole("User");
    await waitFor(() => expect(screen.queryByText("Save")).not.toBeNull());
  });
});
