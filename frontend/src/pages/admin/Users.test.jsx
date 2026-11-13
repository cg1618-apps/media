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
    mode_ceiling: "borderline",
    mode_default: "normal",
    denied_label_keys: ["nsfw"],
    denied_field_group_keys: [],
  },
];

const ROLES = [{ system_id: "admin", label: "Admin" }];

// Served out of rank order on purpose: the panel must order by `rank`.
const MODES = [
  {
    system_id: "u",
    key: "unrestricted",
    label: "Unrestricted",
    rank: 3,
    label_keys: ["nsfw", "h-comic"],
    field_group_keys: ["sources_restricted"],
  },
  {
    system_id: "b",
    key: "borderline",
    label: "Borderline",
    rank: 2,
    label_keys: ["nsfw"],
    field_group_keys: ["sources_restricted"],
  },
  {
    system_id: "n",
    key: "normal",
    label: "Normal",
    rank: 1,
    label_keys: [],
    field_group_keys: ["sources_restricted"],
  },
  {
    system_id: "s",
    key: "safe",
    label: "Safe",
    rank: 0,
    label_keys: [],
    field_group_keys: [],
  },
  {
    system_id: "c",
    key: "custom",
    label: "Custom",
    rank: null,
    label_keys: [],
    field_group_keys: [],
  },
];

async function openPanel() {
  render(<Users />);
  await screen.findByText("alice");
  await userEvent.click(screen.getByRole("button", { name: "Change" }));
  await screen.findByText("Access for alice");
}

const ceilingSelect = () => screen.getByLabelText("Widest mode (ceiling)");
const defaultSelect = () => screen.getByLabelText("Lands here at login (default)");
const optionsOf = (select) =>
  within(select)
    .getAllByRole("option")
    .map((o) => o.textContent);

function lastPut() {
  const puts = fetchJson.mock.calls.filter(([, opts]) => opts?.method === "PUT");
  return JSON.parse(puts[puts.length - 1][1].body);
}

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

  it("shows the ceiling and default in the list", async () => {
    render(<Users />);
    expect(await screen.findByText(/borderline \/ normal \(narrowed\)/)).toBeTruthy();
  });

  it("offers every ranked mode as a ceiling, narrowest first", async () => {
    await openPanel();
    expect(optionsOf(ceilingSelect())).toEqual([
      "No mode",
      "Safe",
      "Normal",
      "Borderline",
      "Unrestricted",
    ]);
  });

  it("offers only modes up to the ceiling as the default", async () => {
    await openPanel();
    expect(optionsOf(defaultSelect())).toEqual(["Safe", "Normal", "Borderline"]);

    await userEvent.selectOptions(ceilingSelect(), "normal");

    expect(optionsOf(defaultSelect())).toEqual(["Safe", "Normal"]);
  });

  it("lists the denials the ceiling shows, and follows it", async () => {
    await openPanel();
    expect(screen.getByLabelText("nsfw")).not.toBeChecked();
    expect(screen.queryByLabelText("h-comic")).toBeNull();

    await userEvent.selectOptions(ceilingSelect(), "unrestricted");
    expect(screen.getByLabelText("h-comic")).toBeChecked();

    await userEvent.selectOptions(ceilingSelect(), "normal");
    expect(screen.queryByLabelText("nsfw")).toBeNull();
    expect(screen.getByLabelText("sources_restricted")).toBeChecked();
  });

  it("saves ceiling, default and denials to the account's endpoint", async () => {
    await openPanel();

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(
        fetchJson.mock.calls.some(
          ([url, opts]) =>
            url === "/api/users/1/access-modes" && opts?.method === "PUT",
        ),
      ).toBe(true),
    );
    expect(lastPut()).toEqual({
      ceiling: "borderline",
      default: "normal",
      denied_label_keys: ["nsfw"],
      denied_field_group_keys: [],
    });
  });

  it("lowering the ceiling below the default moves the default down and drops denials", async () => {
    await openPanel();

    await userEvent.selectOptions(ceilingSelect(), "safe");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(lastPut().ceiling).toBe("safe"));
    expect(lastPut()).toEqual({
      ceiling: "safe",
      default: "safe",
      denied_label_keys: [],
      denied_field_group_keys: [],
    });
  });

  it("parks the account with no mode", async () => {
    await openPanel();

    await userEvent.selectOptions(ceilingSelect(), "");

    expect(screen.getByText(/has no access mode/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(lastPut().ceiling).toBeNull());
    expect(lastPut().default).toBeNull();
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
      if (url.includes("/invites")) {
        return Promise.resolve({
          link: "https://media.example/register?code=inv456",
          expires_at: "2026-11-14T12:00:00Z",
        });
      }
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
  });

  it("does not list a pending account, which /system handles", async () => {
    // erin is served pending; bob, served active by the same answer, is the
    // mirror that proves the table drew rows at all.
    render(<Users />);
    await screen.findByText("bob");
    expect(screen.queryByText("erin")).toBeNull();
  });

  it("offers Disable on another active account, not on your own", async () => {
    render(<Users />);
    await screen.findByText("bob");
    expect(within(rowOf("bob")).queryByRole("button", { name: "Disable" })).toBeTruthy();
    expect(within(rowOf("alice")).queryByRole("button", { name: "Disable" })).toBeNull();
  });

  it("offers Enable, not Disable, on a disabled account", async () => {
    render(<Users />);
    await screen.findByText("dave");
    expect(within(rowOf("dave")).queryByRole("button", { name: "Enable" })).toBeTruthy();
    expect(within(rowOf("dave")).queryByRole("button", { name: "Disable" })).toBeNull();
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

  it("mints an invite link and shows it in the once-shown modal", async () => {
    render(<Users />);
    await screen.findByText("bob");
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Invite link" }));

    const dialog = await screen.findByRole("dialog");
    expect(
      fetchJson.mock.calls.some(
        ([url, o]) => url === "/api/users/invites" && o?.method === "POST",
      ),
    ).toBe(true);
    expect(within(dialog).getByRole("textbox", { name: "Link" })).toHaveValue(
      "https://media.example/register?code=inv456",
    );
    expect(within(dialog).getByText(/shown only once/)).toBeTruthy();
    expect(within(dialog).getByText(/Expires/)).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Copy link" })).toBeTruthy();
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
    mode_ceiling: "normal",
    mode_default: "normal",
    denied_label_keys: [],
    denied_field_group_keys: [],
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

/**
 * The five fixed roles. Only `user` and `super` are offered as an account's
 * role; an admin or shared account keeps its role, and a shared account's mode
 * is fixed and it cannot be deleted. Every refusal is paired with the user
 * row on the same page, so a green proves the role did the hiding rather than
 * the control being absent everywhere.
 */
describe("the fixed roles on /users", () => {
  // All five, in the server's sort order, so a filter that let any of the
  // other three through would show up as an extra option.
  const FIVE_ROLES = [
    { system_id: "r-guest", name: "guest", label: "Guest", is_root: false },
    { system_id: "r-shared", name: "shared", label: "Shared", is_root: false },
    { system_id: "r-user", name: "user", label: "User", is_root: false },
    { system_id: "r-super", name: "super", label: "Super", is_root: false },
    { system_id: "r-admin", name: "admin", label: "Admin", is_root: true },
  ];
  const account = (id, username, roleName, mode) => ({
    id,
    username,
    role_id: `r-${roleName}`,
    role_name: roleName,
    status: "active",
    mode_ceiling: mode,
    mode_default: mode,
    denied_label_keys: [],
    denied_field_group_keys: [],
    open_request_limit: null,
  });
  const FIXED_USERS = [
    account(1, "alice", "admin", "unrestricted"),
    account(2, "bob", "user", "normal"),
    account(3, "shared-normal", "shared", "normal"),
  ];

  beforeEach(() => {
    fetchJson.mockImplementation((url) => {
      if (url.includes("/roles")) return Promise.resolve(FIVE_ROLES);
      if (url.includes("/access-modes")) return Promise.resolve(MODES);
      return Promise.resolve(FIXED_USERS);
    });
  });

  async function editRow(username) {
    render(<Users />);
    await screen.findByText(username);
    await userEvent.click(within(rowOf(username)).getByRole("button", { name: "Edit" }));
    return rowOf(username);
  }

  it("offers only User and Super when creating an account", async () => {
    render(<Users />);
    await screen.findByText("bob");
    expect(optionsOf(screen.getByLabelText("Role"))).toEqual(["User", "Super"]);
  });

  it("offers only User and Super when editing a user account", async () => {
    const row = await editRow("bob");
    expect(optionsOf(within(row).getByRole("combobox", { name: "Role" }))).toEqual([
      "User",
      "Super",
    ]);
  });

  it("shows a shared account's role as text, with no select", async () => {
    const row = await editRow("shared-normal");
    expect(within(row).queryByRole("combobox", { name: "Role" })).toBeNull();
    // Its password can still be set.
    expect(within(row).getByPlaceholderText("New password (optional)")).toBeTruthy();
  });

  it("shows an admin account's role as text, with no select", async () => {
    const row = await editRow("alice");
    expect(within(row).queryByRole("combobox", { name: "Role" })).toBeNull();
  });

  it("offers Delete on a user account and not on a shared one", async () => {
    render(<Users />);
    await screen.findByText("bob");
    expect(within(rowOf("bob")).queryByRole("button", { name: "Delete" })).toBeTruthy();
    expect(
      within(rowOf("shared-normal")).queryByRole("button", { name: "Delete" }),
    ).toBeNull();
  });

  it("keeps Disable on a shared account", async () => {
    render(<Users />);
    await screen.findByText("shared-normal");
    expect(
      within(rowOf("shared-normal")).queryByRole("button", { name: "Disable" }),
    ).toBeTruthy();
  });

  it("shows a shared account's mode as fixed, with no way to change it", async () => {
    render(<Users />);
    await screen.findByText("shared-normal");
    const shared = rowOf("shared-normal");
    expect(within(shared).getByText("Mode: Normal (fixed)")).toBeTruthy();
    expect(within(shared).queryByRole("button", { name: "Change" })).toBeNull();
    // The mirror: the user row still opens the panel.
    await userEvent.click(within(rowOf("bob")).getByRole("button", { name: "Change" }));
    expect(await screen.findByText("Access for bob")).toBeTruthy();
  });
});

/**
 * The per-account feature switches. Only a user or super account holds them,
 * so their rows carry four toggles and an admin or shared row carries none -
 * each refusal paired with a row on the same page that has them.
 */
describe("the feature switches on /users", () => {
  const ROLES_HERE = [
    { system_id: "r-shared", name: "shared", label: "Shared", is_root: false },
    { system_id: "r-user", name: "user", label: "User", is_root: false },
    { system_id: "r-super", name: "super", label: "Super", is_root: false },
    { system_id: "r-admin", name: "admin", label: "Admin", is_root: true },
  ];
  const account = (id, username, roleName, features = {}) => ({
    id,
    username,
    role_id: `r-${roleName}`,
    role_name: roleName,
    status: "active",
    mode_ceiling: "normal",
    mode_default: "normal",
    denied_label_keys: [],
    denied_field_group_keys: [],
    open_request_limit: null,
    feature_quotes_memes: false,
    feature_favourites: false,
    feature_music_status: false,
    feature_mod_status: false,
    ...features,
  });
  const FEATURE_USERS = [
    account(1, "alice", "admin"),
    account(2, "bob", "user", { feature_quotes_memes: true }),
    account(3, "carol", "super"),
    account(4, "shared-normal", "shared"),
  ];
  const LABELS = ["Quotes & memes", "Favourites", "Music status", "Mod status"];

  beforeEach(() => {
    fetchJson.mockImplementation((url, opts) => {
      if (opts?.method === "PATCH") return Promise.resolve({});
      if (url.includes("/roles")) return Promise.resolve(ROLES_HERE);
      if (url.includes("/access-modes")) return Promise.resolve(MODES);
      return Promise.resolve(FEATURE_USERS);
    });
  });

  it("gives a user and a super row all four, and an admin or shared row none", async () => {
    render(<Users />);
    await screen.findByText("bob");
    for (const name of ["bob", "carol"]) {
      for (const label of LABELS) {
        expect(
          within(rowOf(name)).getByRole("checkbox", { name: `${label} for ${name}` }),
        ).toBeTruthy();
      }
    }
    for (const name of ["alice", "shared-normal"]) {
      expect(within(rowOf(name)).queryAllByRole("checkbox")).toHaveLength(0);
    }
  });

  it("shows each switch as stored", async () => {
    render(<Users />);
    await screen.findByText("bob");
    expect(
      within(rowOf("bob")).getByRole("checkbox", { name: "Quotes & memes for bob" }).checked,
    ).toBe(true);
    expect(
      within(rowOf("bob")).getByRole("checkbox", { name: "Favourites for bob" }).checked,
    ).toBe(false);
  });

  it("saves a toggle as a PATCH of that one field", async () => {
    render(<Users />);
    await screen.findByText("bob");
    await userEvent.click(
      within(rowOf("bob")).getByRole("checkbox", { name: "Mod status for bob" }),
    );
    const patch = fetchJson.mock.calls.find(([, opts]) => opts?.method === "PATCH");
    expect(patch[0]).toContain("/users/2");
    expect(JSON.parse(patch[1].body)).toEqual({ feature_mod_status: true });
  });
});
