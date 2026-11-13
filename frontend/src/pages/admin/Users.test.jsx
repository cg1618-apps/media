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
