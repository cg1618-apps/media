import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Users from "./Users";

/**
 * Every per-account control lives in the row's Edit dialog; the table's
 * Access column is a read-only summary of it.
 *
 * The dialog's reachability is worth a test because the failure mode here is
 * SILENT: the button sets a piece of state, and if nothing reads that state
 * the click does nothing at all - no error, no toast, no console warning. A
 * rendering assertion is the only thing that notices.
 */

const USERS = [
  {
    id: 1,
    username: "alice",
    role_id: "user",
    mode_ceiling: "borderline",
    mode_default: "normal",
    denied_label_keys: ["nsfw"],
    denied_field_group_keys: [],
  },
];

const ROLES = [{ system_id: "user", name: "user", label: "User" }];

// Served out of rank order on purpose: the dialog must order by `rank`.
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

function rowOf(username) {
  return screen.getByText(username).closest("tr");
}

async function openEdit(username) {
  await userEvent.click(within(rowOf(username)).getByRole("button", { name: "Edit" }));
  return screen.findByRole("dialog", { name: `Edit ${username}` });
}

async function openPanel() {
  render(<Users />);
  await screen.findByText("alice");
  return openEdit("alice");
}

const ceilingSelect = () => screen.getByLabelText("Widest mode (ceiling)");
const defaultSelect = () => screen.getByLabelText("Lands here at login (default)");
const optionsOf = (select) =>
  within(select)
    .getAllByRole("option")
    .map((o) => o.textContent);

const callsOf = (method) =>
  fetchJson.mock.calls.filter(([, opts]) => opts?.method === method);

function lastPut() {
  const puts = callsOf("PUT");
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

describe("the access mode in the Edit dialog", () => {
  it("opens when Edit is clicked", async () => {
    // THE LOAD-BEARING CASE. Everything else on this page can be right while
    // the dialog is unreachable, because an unmounted component breaks
    // nothing it does not render.
    render(<Users />);
    await screen.findByText("alice");

    const dialog = await openEdit("alice");

    expect(within(dialog).getByLabelText("Widest mode (ceiling)")).toBeTruthy();
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

  it("saves a changed ceiling to the account's endpoint", async () => {
    const dialog = await openPanel();

    await userEvent.selectOptions(ceilingSelect(), "unrestricted");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(callsOf("PUT")).toHaveLength(1));
    expect(callsOf("PUT")[0][0]).toBe("/api/users/1/access-modes");
    expect(lastPut()).toEqual({
      ceiling: "unrestricted",
      default: "normal",
      denied_label_keys: ["nsfw"],
      denied_field_group_keys: [],
    });
    expect(callsOf("PATCH")).toHaveLength(0);
  });

  it("saves a changed default to the account's endpoint", async () => {
    const dialog = await openPanel();

    await userEvent.selectOptions(defaultSelect(), "safe");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(callsOf("PUT")).toHaveLength(1));
    expect(callsOf("PUT")[0][0]).toBe("/api/users/1/access-modes");
    expect(lastPut()).toEqual({
      ceiling: "borderline",
      default: "safe",
      denied_label_keys: ["nsfw"],
      denied_field_group_keys: [],
    });
  });

  it("saves a changed denial to the account's endpoint", async () => {
    const dialog = await openPanel();

    await userEvent.click(screen.getByLabelText("nsfw"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(callsOf("PUT")).toHaveLength(1));
    expect(lastPut().denied_label_keys).toEqual([]);
  });

  it("lowering the ceiling below the default moves the default down and drops denials", async () => {
    const dialog = await openPanel();

    await userEvent.selectOptions(ceilingSelect(), "safe");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(lastPut().ceiling).toBe("safe"));
    expect(lastPut()).toEqual({
      ceiling: "safe",
      default: "safe",
      denied_label_keys: [],
      denied_field_group_keys: [],
    });
  });

  it("parks the account with no mode", async () => {
    const dialog = await openPanel();

    await userEvent.selectOptions(ceilingSelect(), "");

    expect(screen.getByText(/has no access mode/)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(lastPut().ceiling).toBeNull());
    expect(lastPut().default).toBeNull();
  });

  it("sends nothing for a save that changed nothing", async () => {
    const dialog = await openPanel();

    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(callsOf("PUT")).toHaveLength(0);
    expect(callsOf("PATCH")).toHaveLength(0);
  });

  it("closes without saving when Cancel is clicked", async () => {
    const dialog = await openPanel();

    await userEvent.selectOptions(ceilingSelect(), "safe");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(callsOf("PUT")).toHaveLength(0);
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
    const dialog = await openEdit("bob");
    expect(
      within(dialog).getByPlaceholderText("New password (optional)"),
    ).toHaveAccessibleDescription(/signs this account out everywhere/);
  });
});

describe("the open request limit", () => {
  // One account per role the field cares about: a user (limited), a super
  // (never limited) and the admin (files nothing). The super and admin
  // cases are the refusals; the user case is the mirror that proves the field
  // exists at all, so its absence elsewhere is the role's doing.
  const LIMIT_ROLES = [
    { system_id: "r-user", name: "user", label: "User" },
    { system_id: "r-super", name: "super", label: "Super" },
    { system_id: "r-admin", name: "admin", label: "Admin" },
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
    account(3, "admin", "r-admin", null),
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
    await screen.findByText(username);
    return openEdit(username);
  }

  it("is offered for a user account, holding its current limit", async () => {
    await editRow("ursula");
    expect(screen.getByLabelText("Open request limit")).toHaveValue(15);
  });

  it("is not offered for a super account", async () => {
    await editRow("sam");
    expect(screen.queryByLabelText("Open request limit")).toBeNull();
  });

  it("is not offered for the admin account", async () => {
    await editRow("admin");
    expect(screen.queryByLabelText("Open request limit")).toBeNull();
  });

  it("sends the limit only when it changed, and blank as no limit", async () => {
    const dialog = await editRow("ursula");
    const field = screen.getByLabelText("Open request limit");
    await userEvent.clear(field);
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(callsOf("PATCH")).toHaveLength(1));
    const [url, opts] = callsOf("PATCH")[0];
    expect(url).toBe("/api/users/1");
    expect(JSON.parse(opts.body)).toEqual({ open_request_limit: null });
  });

  it("leaves the limit out of a save that did not touch it", async () => {
    const dialog = await editRow("ursula");
    await userEvent.type(
      within(dialog).getByPlaceholderText("New password (optional)"),
      "pw",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(callsOf("PATCH")).toHaveLength(1));
    expect(JSON.parse(callsOf("PATCH")[0][1].body)).toEqual({ password: "pw" });
  });
});

/**
 * The five fixed roles. Only `user` and `super` are offered as an account's
 * role; an admin or shared account keeps its role and cannot be deleted. A
 * shared account's mode is edited like any other account's; the admin
 * account has none. Every refusal is paired with the user row on the same
 * page, so a green proves the role did the hiding rather than the control
 * being absent everywhere.
 */
describe("the fixed roles on /users", () => {
  // All five, in the server's sort order, so a filter that let any of the
  // other three through would show up as an extra option.
  const FIVE_ROLES = [
    { system_id: "r-guest", name: "guest", label: "Guest" },
    { system_id: "r-shared", name: "shared", label: "Shared" },
    { system_id: "r-user", name: "user", label: "User" },
    { system_id: "r-super", name: "super", label: "Super" },
    { system_id: "r-admin", name: "admin", label: "Admin" },
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
    // The admin account has no mode (ceiling and default null).
    account(1, "alice", "admin", null),
    account(2, "bob", "user", "normal"),
    account(3, "shared-normal", "shared", "normal"),
  ];

  beforeEach(() => {
    fetchJson.mockImplementation((url, opts) => {
      if (opts?.method === "PUT") return Promise.resolve({});
      if (url.includes("/roles")) return Promise.resolve(FIVE_ROLES);
      if (url.includes("/access-modes")) return Promise.resolve(MODES);
      return Promise.resolve(FIXED_USERS);
    });
  });

  async function editRow(username) {
    render(<Users />);
    await screen.findByText(username);
    return openEdit(username);
  }

  it("offers only User and Super when creating an account", async () => {
    render(<Users />);
    await screen.findByText("bob");
    expect(optionsOf(screen.getByLabelText("Role"))).toEqual(["User", "Super"]);
  });

  it("offers only User and Super when editing a user account", async () => {
    const dialog = await editRow("bob");
    expect(optionsOf(within(dialog).getByRole("combobox", { name: "Role" }))).toEqual([
      "User",
      "Super",
    ]);
  });

  it("shows a shared account's role as text, with no select", async () => {
    const dialog = await editRow("shared-normal");
    expect(within(dialog).queryByRole("combobox", { name: "Role" })).toBeNull();
    expect(within(dialog).getByText("shared")).toBeTruthy();
    // Its password can still be set.
    expect(within(dialog).getByPlaceholderText("New password (optional)")).toBeTruthy();
  });

  it("shows an admin account's role as text, with no select", async () => {
    const dialog = await editRow("alice");
    expect(within(dialog).queryByRole("combobox", { name: "Role" })).toBeNull();
    expect(within(dialog).getByText("admin")).toBeTruthy();
  });

  it("offers Delete on a user account and not on a shared or admin one", async () => {
    render(<Users />);
    await screen.findByText("bob");
    expect(within(rowOf("bob")).queryByRole("button", { name: "Delete" })).toBeTruthy();
    expect(
      within(rowOf("shared-normal")).queryByRole("button", { name: "Delete" }),
    ).toBeNull();
    // The server answers 409 to deleting the admin account.
    expect(within(rowOf("alice")).queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("offers the admin account no mode controls, since it has no mode", async () => {
    // The server answers 409 to a ceiling on the admin account. The user
    // account's dialog on the same page is the mirror: it has them.
    render(<Users />);
    await screen.findByText("alice");
    expect(within(rowOf("alice")).getByText("No mode (admin)")).toBeTruthy();

    const admin = await openEdit("alice");
    expect(within(admin).queryByLabelText("Widest mode (ceiling)")).toBeNull();
    await userEvent.click(within(admin).getByRole("button", { name: "Cancel" }));

    const bob = await openEdit("bob");
    expect(within(bob).getByLabelText("Widest mode (ceiling)")).toBeTruthy();
  });

  it("keeps Disable on a shared account", async () => {
    render(<Users />);
    await screen.findByText("shared-normal");
    expect(
      within(rowOf("shared-normal")).queryByRole("button", { name: "Disable" }),
    ).toBeTruthy();
  });

  it("offers a shared account's mode ceiling and default, and saves them", async () => {
    const dialog = await editRow("shared-normal");
    const ceiling = within(dialog).getByLabelText("Widest mode (ceiling)");
    expect(optionsOf(ceiling)).toEqual([
      "No mode",
      "Safe",
      "Normal",
      "Borderline",
      "Unrestricted",
    ]);

    await userEvent.selectOptions(ceiling, "borderline");
    await userEvent.selectOptions(
      within(dialog).getByLabelText("Lands here at login (default)"),
      "safe",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(callsOf("PUT")).toHaveLength(1));
    const [url, opts] = callsOf("PUT")[0];
    expect(url).toBe("/api/users/3/access-modes");
    expect(JSON.parse(opts.body)).toEqual({
      ceiling: "borderline",
      default: "safe",
      denied_label_keys: [],
      denied_field_group_keys: [],
    });
  });

  it("shows a shared account's mode like any other, never as fixed", async () => {
    render(<Users />);
    await screen.findByText("shared-normal");
    // The summary is there, so the missing "(fixed)" is not an empty cell.
    expect(within(rowOf("shared-normal")).getByText("normal / normal")).toBeTruthy();
    expect(screen.queryByText(/fixed/i)).toBeNull();

    const dialog = await openEdit("shared-normal");
    expect(within(dialog).getByLabelText("Widest mode (ceiling)")).toHaveValue("normal");
    expect(screen.queryByText(/fixed/i)).toBeNull();
  });
});

/**
 * The per-account feature switches and the read-only Access column. Only a
 * user or super account holds the switches, so their Edit dialogs carry four
 * and an admin or shared dialog carries none - each refusal paired with an
 * account on the same page that has them. The table carries no control at
 * all, and the "no control" assertion is made in the same render as the
 * summary text it replaces, so the absence is not an empty table.
 */
describe("the feature switches on /users", () => {
  const ROLES_HERE = [
    { system_id: "r-shared", name: "shared", label: "Shared" },
    { system_id: "r-user", name: "user", label: "User" },
    { system_id: "r-super", name: "super", label: "Super" },
    { system_id: "r-admin", name: "admin", label: "Admin" },
  ];
  const account = (id, username, roleName, features = {}) => ({
    id,
    username,
    role_id: `r-${roleName}`,
    role_name: roleName,
    status: "active",
    mode_ceiling: roleName === "admin" ? null : "normal",
    mode_default: roleName === "admin" ? null : "normal",
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
    account(2, "bob", "user", { feature_quotes_memes: true, feature_mod_status: true }),
    account(3, "carol", "super"),
    account(4, "shared-normal", "shared"),
  ];
  const FIELDS = {
    "Quotes & memes": "feature_quotes_memes",
    Favourites: "feature_favourites",
    "Music status": "feature_music_status",
    "Mod status": "feature_mod_status",
  };
  const LABELS = Object.keys(FIELDS);

  beforeEach(() => {
    fetchJson.mockImplementation((url, opts) => {
      if (opts?.method === "PATCH") return Promise.resolve({});
      if (url.includes("/roles")) return Promise.resolve(ROLES_HERE);
      if (url.includes("/access-modes")) return Promise.resolve(MODES);
      return Promise.resolve(FEATURE_USERS);
    });
  });

  it("puts no control in the Access column, only its summary as text", async () => {
    render(<Users />);
    await screen.findByText("bob");
    // The summary is there - each row's mode and the switches that are on...
    const bob = rowOf("bob");
    expect(within(bob).getByText("normal / normal")).toBeTruthy();
    expect(within(bob).getByText("Quotes & memes")).toBeTruthy();
    expect(within(bob).getByText("Mod status")).toBeTruthy();
    expect(within(bob).queryByText("Favourites")).toBeNull();
    expect(within(rowOf("carol")).getByText("No features on")).toBeTruthy();
    expect(within(rowOf("shared-normal")).getByText("normal / normal")).toBeTruthy();
    expect(within(rowOf("alice")).getByText("No mode (admin)")).toBeTruthy();
    // ...and nothing in the table is a control but each row's action buttons.
    const table = screen.getByRole("table");
    expect(within(table).queryAllByRole("checkbox")).toHaveLength(0);
    expect(within(table).queryAllByRole("combobox")).toHaveLength(0);
    expect(within(table).queryByRole("button", { name: "Change" })).toBeNull();
    expect(within(bob).getByRole("button", { name: "Edit" })).toBeTruthy();
  });

  it("gives a user and a super dialog all four, and an admin or shared dialog none", async () => {
    render(<Users />);
    await screen.findByText("bob");
    for (const name of ["bob", "carol"]) {
      const dialog = await openEdit(name);
      for (const label of LABELS) {
        expect(within(dialog).getByRole("checkbox", { name: label })).toBeTruthy();
      }
      await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    }
    for (const name of ["alice", "shared-normal"]) {
      const dialog = await openEdit(name);
      for (const label of LABELS) {
        expect(within(dialog).queryByRole("checkbox", { name: label })).toBeNull();
      }
      await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    }
  });

  it("shows each switch as stored", async () => {
    render(<Users />);
    await screen.findByText("bob");
    const dialog = await openEdit("bob");
    expect(within(dialog).getByRole("checkbox", { name: "Quotes & memes" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "Favourites" })).not.toBeChecked();
  });

  for (const label of LABELS) {
    it(`saves ${label} from the dialog as a PATCH of that one field`, async () => {
      render(<Users />);
      await screen.findByText("bob");
      const dialog = await openEdit("bob");
      const box = within(dialog).getByRole("checkbox", { name: label });
      const was = box.checked;

      await userEvent.click(box);
      // Nothing is sent until Save.
      expect(callsOf("PATCH")).toHaveLength(0);
      await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

      await waitFor(() => expect(callsOf("PATCH")).toHaveLength(1));
      const [url, opts] = callsOf("PATCH")[0];
      expect(url).toBe("/api/users/2");
      expect(JSON.parse(opts.body)).toEqual({ [FIELDS[label]]: !was });
      expect(callsOf("PUT")).toHaveLength(0);
    });
  }
});
