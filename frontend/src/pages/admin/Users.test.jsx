import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Users from "./Users";

/**
 * The Access column's "Change" button opens the per-account mode panel.
 *
 * It is worth a test because the failure mode here is SILENT: the button sets
 * a piece of state, and if nothing reads that state the click does nothing at
 * all - no error, no toast, no console warning. That is exactly how the panel
 * shipped in 384bbdd4 and stayed dead; eslint said "assigned a value but
 * never used" three times and said it as a WARNING, which CI does not fail
 * on. A rendering assertion is the only thing that notices.
 */

const USERS = [
  {
    id: 1,
    username: "alice",
    role_id: "admin",
    access_modes: [
      {
        mode_id: "wide",
        is_default: true,
        denied_label_keys: [],
        denied_field_group_keys: [],
      },
    ],
  },
];

const ROLES = [{ system_id: "admin", label: "Admin" }];

const MODES = [
  {
    system_id: "wide",
    label: "Wide",
    label_keys: ["nsfw"],
    field_group_keys: [],
  },
  { system_id: "narrow", label: "Narrow", label_keys: [], field_group_keys: [] },
];

const showToast = vi.fn();
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast }),
}));

// The signed-in admin is alice, so her row is "your own row".
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ username: "alice" }),
}));

const fetchJson = vi.fn();
vi.mock("../../api/client", () => ({
  fetchJson: (...args) => fetchJson(...args),
  jsonBody: (body) => ({ body: JSON.stringify(body) }),
}));

beforeEach(() => {
  showToast.mockReset();
  fetchJson.mockReset();
  fetchJson.mockImplementation((url) => {
    if (url.includes("/roles")) return Promise.resolve(ROLES);
    if (url.includes("/access-modes")) return Promise.resolve(MODES);
    return Promise.resolve(USERS);
  });
});

describe("the access-mode panel", () => {
  it("opens when Change is clicked", async () => {
    // THE LOAD-BEARING CASE. Everything else on this page can be right while
    // the panel is unreachable, because an unmounted component breaks nothing
    // it does not render.
    render(<Users />);
    await screen.findByText("alice");

    await userEvent.click(screen.getByRole("button", { name: "Change" }));

    expect(await screen.findByText("Access for alice")).toBeTruthy();
  });

  it("offers every mode, not only the ones the account holds", async () => {
    // The panel's whole job is granting a mode the account does not have yet,
    // so a panel listing only held modes would open and still be useless.
    render(<Users />);
    await screen.findByText("alice");
    await userEvent.click(screen.getByRole("button", { name: "Change" }));

    await screen.findByText("Access for alice");
    expect(screen.getByText("Wide")).toBeTruthy();
    expect(screen.getByText("Narrow")).toBeTruthy();
  });

  it("saves the held modes to the account's access-modes endpoint", async () => {
    render(<Users />);
    await screen.findByText("alice");
    await userEvent.click(screen.getByRole("button", { name: "Change" }));
    await screen.findByText("Access for alice");

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(
        fetchJson.mock.calls.some(
          ([url, opts]) =>
            url === "/api/users/1/access-modes" && opts?.method === "PUT",
        ),
      ).toBe(true),
    );
  });

  it("closes without saving when Close is clicked", async () => {
    render(<Users />);
    await screen.findByText("alice");
    await userEvent.click(screen.getByRole("button", { name: "Change" }));
    await screen.findByText("Access for alice");

    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() =>
      expect(screen.queryByText("Access for alice")).toBeNull(),
    );
    expect(
      fetchJson.mock.calls.some(([, opts]) => opts?.method === "PUT"),
    ).toBe(false);
  });
});

/**
 * The lifecycle controls. Each "not offered" case is paired with a row where
 * the same control IS offered, so a green proves the row's status, role or
 * ownership did the hiding rather than the control being missing everywhere.
 */
const LIFECYCLE_USERS = [
  { id: 1, username: "alice", role_name: "admin", status: "active", access_modes: [] },
  { id: 2, username: "bob", role_name: "user", status: "active", access_modes: [] },
  { id: 3, username: "shared-normal", role_name: "shared", status: "active", access_modes: [] },
  { id: 4, username: "dave", role_name: "user", status: "disabled", access_modes: [] },
  { id: 5, username: "erin", role_name: "user", status: "pending", access_modes: [] },
];

function rowOf(username) {
  return screen.getByText(username).closest("tr");
}

describe("account lifecycle on /users", () => {
  beforeEach(() => {
    fetchJson.mockImplementation((url, opts) => {
      if (url.includes("/reset-link")) {
        return Promise.resolve({
          link: "https://media.example/reset?code=abc123",
          expires_at: "2026-11-14T12:00:00Z",
        });
      }
      if (opts?.method === "PATCH") return Promise.resolve({});
      if (url.includes("/roles")) return Promise.resolve(ROLES);
      if (url.includes("/access-modes")) return Promise.resolve(MODES);
      return Promise.resolve(LIFECYCLE_USERS);
    });
  });

  it("shows each account's status", async () => {
    render(<Users />);
    await screen.findByText("bob");
    expect(within(rowOf("bob")).getByText("active")).toBeTruthy();
    expect(within(rowOf("dave")).getByText("disabled")).toBeTruthy();
    expect(within(rowOf("erin")).getByText("pending")).toBeTruthy();
  });

  it("offers Disable on another active account, not on your own", async () => {
    render(<Users />);
    await screen.findByText("bob");
    expect(within(rowOf("bob")).queryByRole("button", { name: "Disable" })).toBeTruthy();
    expect(within(rowOf("alice")).queryByRole("button", { name: "Disable" })).toBeNull();
  });

  it("offers Enable on a disabled account and neither on a pending one", async () => {
    render(<Users />);
    await screen.findByText("dave");
    expect(within(rowOf("dave")).queryByRole("button", { name: "Enable" })).toBeTruthy();
    expect(within(rowOf("dave")).queryByRole("button", { name: "Disable" })).toBeNull();
    expect(within(rowOf("erin")).queryByRole("button", { name: "Enable" })).toBeNull();
    expect(within(rowOf("erin")).queryByRole("button", { name: "Disable" })).toBeNull();
  });

  it("asks before disabling, says it signs out everywhere, then PATCHes", async () => {
    render(<Users />);
    await screen.findByText("bob");
    await userEvent.click(within(rowOf("bob")).getByRole("button", { name: "Disable" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/signs bob out everywhere/)).toBeTruthy();
    // Nothing is sent until the confirm.
    expect(fetchJson.mock.calls.some(([, o]) => o?.method === "PATCH")).toBe(false);

    await userEvent.click(within(dialog).getByRole("button", { name: "Disable" }));
    await waitFor(() => {
      const patch = fetchJson.mock.calls.find(([, o]) => o?.method === "PATCH");
      expect(patch?.[0]).toBe("/api/users/2");
      expect(JSON.parse(patch[1].body)).toEqual({ status: "disabled" });
    });
  });

  it("enables a disabled account", async () => {
    render(<Users />);
    await screen.findByText("dave");
    await userEvent.click(within(rowOf("dave")).getByRole("button", { name: "Enable" }));
    await waitFor(() => {
      const patch = fetchJson.mock.calls.find(([, o]) => o?.method === "PATCH");
      expect(patch?.[0]).toBe("/api/users/4");
      expect(JSON.parse(patch[1].body)).toEqual({ status: "active" });
    });
  });

  it("offers a reset link on an active member, not on a shared or inactive one", async () => {
    render(<Users />);
    await screen.findByText("bob");
    expect(within(rowOf("bob")).queryByRole("button", { name: "Reset link" })).toBeTruthy();
    expect(
      within(rowOf("shared-normal")).queryByRole("button", { name: "Reset link" }),
    ).toBeNull();
    expect(within(rowOf("dave")).queryByRole("button", { name: "Reset link" })).toBeNull();
    expect(within(rowOf("erin")).queryByRole("button", { name: "Reset link" })).toBeNull();
  });

  it("shows the minted link once, with its expiry and a copy button", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<Users />);
    await screen.findByText("bob");
    await userEvent.click(within(rowOf("bob")).getByRole("button", { name: "Reset link" }));

    const dialog = await screen.findByRole("dialog");
    expect(
      fetchJson.mock.calls.some(
        ([url, o]) => url === "/api/users/2/reset-link" && o?.method === "POST",
      ),
    ).toBe(true);
    expect(within(dialog).getByRole("textbox", { name: "Link" })).toHaveValue(
      "https://media.example/reset?code=abc123",
    );
    expect(within(dialog).getByText(/shown only once/)).toBeTruthy();
    expect(within(dialog).getByText(/Expires/)).toBeTruthy();

    await userEvent.click(within(dialog).getByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenCalledWith("https://media.example/reset?code=abc123");

    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("says on the password field that setting one signs the account out", async () => {
    render(<Users />);
    await screen.findByText("bob");
    await userEvent.click(within(rowOf("bob")).getByRole("button", { name: "Edit" }));
    expect(
      screen.getByPlaceholderText("New password (optional)"),
    ).toHaveAccessibleDescription(/signs this account out everywhere/);
  });
});

describe("the open request limit", () => {
  // One account per role the field cares about: a user (limited), a super
  // (never limited) and the root admin (files nothing). The super and admin
  // cases are the refusals; the user case is the mirror that proves the field
  // exists at all, so its absence elsewhere is the role's doing.
  const LIMIT_ROLES = [
    { system_id: "r-user", name: "user", label: "User", is_root: false },
    { system_id: "r-super", name: "super", label: "Super", is_root: false },
    { system_id: "r-admin", name: "admin", label: "Admin", is_root: true },
  ];
  const account = (id, username, roleId, limit) => ({
    id,
    username,
    role_id: roleId,
    access_modes: [],
    open_request_limit: limit,
  });
  const LIMIT_USERS = [
    account(1, "ursula", "r-user", 15),
    account(2, "sam", "r-super", null),
    account(3, "root", "r-admin", null),
  ];

  beforeEach(() => {
    fetchJson.mockImplementation((url, opts) => {
      if (opts?.method === "PATCH") return Promise.resolve({});
      if (url.includes("/roles")) return Promise.resolve(LIMIT_ROLES);
      if (url.includes("/access-modes")) return Promise.resolve([]);
      return Promise.resolve(LIMIT_USERS);
    });
  });

  async function editRow(username) {
    render(<Users />);
    const cell = await screen.findByText(username);
    const row = cell.closest("tr");
    await userEvent.click(within(row).getByRole("button", { name: "Edit" }));
    return row;
  }

  const patches = () =>
    fetchJson.mock.calls.filter(([, opts]) => opts?.method === "PATCH");

  it("is offered for a user account, holding its current limit", async () => {
    await editRow("ursula");
    expect(screen.getByLabelText("Open request limit")).toHaveValue(15);
  });

  it("is not offered for a super account", async () => {
    await editRow("sam");
    expect(screen.queryByLabelText("Open request limit")).toBeNull();
  });

  it("is not offered for the root account", async () => {
    await editRow("root");
    expect(screen.queryByLabelText("Open request limit")).toBeNull();
  });

  it("sends the limit only when it changed, and blank as no limit", async () => {
    const row = await editRow("ursula");
    const field = screen.getByLabelText("Open request limit");
    await userEvent.clear(field);
    await userEvent.click(within(row).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(patches()).toHaveLength(1));
    const [url, opts] = patches()[0];
    expect(url).toBe("/api/users/1");
    expect(JSON.parse(opts.body)).toEqual({ open_request_limit: null });
  });

  it("leaves the limit out of a save that did not touch it", async () => {
    const row = await editRow("ursula");
    await userEvent.type(
      within(row).getByPlaceholderText("New password (optional)"),
      "pw",
    );
    await userEvent.click(within(row).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(JSON.parse(patches()[0][1].body)).toEqual({ password: "pw" });
  });
});
