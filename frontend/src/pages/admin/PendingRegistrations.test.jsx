// The Pending registrations panel on /system. It is drawn - and asks the
// server for anything - only for a session holding admin.authz; the same
// render with the key is the mirror, so a hidden panel is the gate's doing.
// Approve sends the values chosen on the row; Decline is irreversible, so its
// test asserts nothing is sent until the confirm is pressed.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PendingRegistrations from "./PendingRegistrations";

const showToast = vi.fn();
vi.mock("../../hooks/useToast", () => ({ useToast: () => ({ showToast }) }));

const { auth } = vi.hoisted(() => ({ auth: { keys: [] } }));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ has: (p) => auth.keys.includes(p) }),
}));

const ROLES = [
  { system_id: "r-user", name: "user", label: "User" },
  { system_id: "r-super", name: "super", label: "Super" },
  { system_id: "r-admin", name: "admin", label: "Admin" },
];
const PENDING = [{ id: "u-kana", username: "kana", status: "pending" }];

let pendingRows;
let approveAnswer;

function answer(status, body) {
  return Promise.resolve({
    ok: status < 400,
    status,
    statusText: "",
    json: () => Promise.resolve(body),
  });
}

beforeEach(() => {
  showToast.mockReset();
  auth.keys = ["admin.authz"];
  pendingRows = PENDING;
  approveAnswer = () => answer(200, { ...PENDING[0], status: "active" });
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => {
      if (url.endsWith("/approve")) return approveAnswer();
      if (url.endsWith("/reject")) return Promise.resolve({ ok: true, status: 204 });
      if (url.startsWith("/api/roles")) return answer(200, ROLES);
      return answer(200, pendingRows);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PendingRegistrations />
    </QueryClientProvider>,
  );
}

const writes = () => global.fetch.mock.calls.filter(([, opts]) => opts?.method === "POST");
const rowOf = (text) => screen.getByText(text).closest("li");

describe("the pending registrations panel", () => {
  it("is not drawn, and asks nothing, without admin.authz", () => {
    auth.keys = ["manage.pipelines"];
    renderPanel();
    expect(screen.queryByText("Pending Registrations")).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("lists the pending accounts with admin.authz", async () => {
    renderPanel();
    expect(screen.getByText("Pending Registrations")).toBeInTheDocument();
    expect(await screen.findByText("kana")).toBeInTheDocument();
    expect(
      global.fetch.mock.calls.some(([url]) => url === "/api/users/?status=pending"),
    ).toBe(true);
  });

  it("says there are none when nobody is waiting", async () => {
    pendingRows = [];
    renderPanel();
    expect(await screen.findByText("No pending registrations")).toBeInTheDocument();
  });

  it("defaults to user, normal / normal and never offers unrestricted", async () => {
    renderPanel();
    await screen.findByText("kana");
    const row = within(rowOf("kana"));
    expect(row.getByLabelText("Role")).toHaveValue("user");
    expect(row.getByLabelText("Ceiling")).toHaveValue("normal");
    expect(row.getByLabelText("Default")).toHaveValue("normal");
    const ceilingOptions = within(row.getByLabelText("Ceiling"))
      .getAllByRole("option")
      .map((o) => o.value);
    expect(ceilingOptions).toEqual(["safe", "normal", "borderline"]);
  });

  it("approves with the role and modes chosen on the row", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("kana");
    const row = within(rowOf("kana"));
    // Wait for the roles, which carry the id the server takes.
    await waitFor(() =>
      expect(global.fetch.mock.calls.some(([url]) => url === "/api/roles/")).toBe(true),
    );
    await user.selectOptions(row.getByLabelText("Role"), "super");
    await user.selectOptions(row.getByLabelText("Ceiling"), "borderline");
    await user.selectOptions(row.getByLabelText("Default"), "safe");
    await user.click(row.getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    const [[url, opts]] = writes();
    expect(url).toBe("/api/users/u-kana/approve");
    expect(JSON.parse(opts.body)).toEqual({
      role_id: "r-super",
      ceiling_mode: "borderline",
      default_mode: "safe",
    });
    // The pending list is invalidated, so it is asked for again.
    const listReads = () =>
      global.fetch.mock.calls.filter(([u]) => u === "/api/users/?status=pending").length;
    await waitFor(() => expect(listReads()).toBe(2));
  });

  it("shows the server's refusal of an approval", async () => {
    approveAnswer = () => answer(422, { detail: "An account's role is either user or super." });
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("kana");
    await user.click(within(rowOf("kana")).getByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        "error",
        "An account's role is either user or super.",
      ),
    );
  });

  it("asks before declining, then posts the decline", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("kana");
    await user.click(within(rowOf("kana")).getByRole("button", { name: "Decline" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Decline kana\?/)).toBeInTheDocument();
    expect(writes()).toHaveLength(0);

    await user.click(within(dialog).getByRole("button", { name: "Decline" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0][0]).toBe("/api/users/u-kana/reject");
  });
});
