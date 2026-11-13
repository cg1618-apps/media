// The request inbox: it opens on the open requests, and each action reaches
// the endpoint the server gates it on. Delete is the one irreversible action,
// so its test asserts that nothing is sent until the confirm is pressed.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import RequestInbox from "./RequestInbox";

vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const base = {
  kind: "data_error",
  remark: null,
  page_path: null,
  target: null,
  response: null,
  handled_by_username: null,
  handled_at: null,
  created_at: "2026-11-13T10:00:00",
  updated_at: "2026-11-13T10:00:00",
  can_edit: false,
};

const OPEN = { ...base, id: "o1", status: "open", description: "Wrong year", author_username: null };
const DONE = {
  ...base,
  id: "d1",
  status: "done",
  description: "Add Dandadan",
  author_username: "bob",
  response: "Added",
  handled_by_username: "cg1618",
  handled_at: "2026-11-13T11:00:00",
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url, opts) => {
      if (opts?.method === "DELETE") return Promise.resolve({ ok: true, status: 204 });
      if (opts?.method === "PUT")
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(OPEN) });
      const status = new URL(url, "http://x").searchParams.get("status");
      const rows = status === "open" ? [OPEN] : status === "done" ? [DONE] : [OPEN, DONE];
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(rows) });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <RequestInbox />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const writes = () =>
  global.fetch.mock.calls.filter(([, opts]) => opts?.method && opts.method !== "GET");
const rowOf = (text) => screen.getByText(text).closest("tr");
const filter = () => within(screen.getByRole("group", { name: "Status filter" }));

describe("the request inbox", () => {
  it("opens on the open requests", async () => {
    renderPage();
    await screen.findByText("Wrong year");
    expect(filter().getByRole("button", { name: "Open" })).toHaveAttribute("aria-pressed", "true");
    expect(global.fetch.mock.calls[0][0]).toBe("/api/requests?status=open");
    expect(screen.queryByText("Add Dandadan")).toBeNull();
  });

  it("shows a deleted author as a deleted account", async () => {
    renderPage();
    await screen.findByText("Wrong year");
    expect(within(rowOf("Wrong year")).getByText("deleted account")).toBeInTheDocument();
  });

  it("switches the filter and shows who handled a closed one", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Wrong year");
    await user.click(filter().getByRole("button", { name: "Done" }));
    await screen.findByText("Add Dandadan");
    expect(
      global.fetch.mock.calls.some(([url]) => url === "/api/requests?status=done"),
    ).toBe(true);
    const row = rowOf("Add Dandadan");
    expect(within(row).getByText("cg1618")).toBeInTheDocument();
    expect(within(row).getByText("Added")).toBeInTheDocument();
  });

  it("declines with the response typed into the dialog", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Wrong year");
    await user.click(within(rowOf("Wrong year")).getByRole("button", { name: "Decline" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText(/response/i), "Year is right");
    await user.click(within(dialog).getByRole("button", { name: "Decline" }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    const [[url, opts]] = writes();
    expect(url).toBe("/api/requests/o1/status");
    expect(opts.method).toBe("PUT");
    expect(JSON.parse(opts.body)).toEqual({ status: "declined", response: "Year is right" });
  });

  it("marks done with no response as null", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Wrong year");
    await user.click(within(rowOf("Wrong year")).getByRole("button", { name: "Done" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Mark done" }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(JSON.parse(writes()[0][1].body)).toEqual({ status: "done", response: null });
  });

  it("reopens a closed one", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Wrong year");
    await user.click(filter().getByRole("button", { name: "All" }));
    await screen.findByText("Add Dandadan");
    // An open row offers no Reopen; a closed one offers no Done.
    expect(within(rowOf("Wrong year")).queryByRole("button", { name: "Reopen" })).toBeNull();
    expect(within(rowOf("Add Dandadan")).queryByRole("button", { name: "Done" })).toBeNull();
    await user.click(within(rowOf("Add Dandadan")).getByRole("button", { name: "Reopen" }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    const [[url, opts]] = writes();
    expect(url).toBe("/api/requests/d1/status");
    expect(JSON.parse(opts.body)).toEqual({ status: "open" });
  });

  it("deletes only once the confirm is pressed", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Wrong year");
    await user.click(within(rowOf("Wrong year")).getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog");
    expect(writes()).toEqual([]);

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(writes()).toEqual([]);

    await user.click(within(rowOf("Wrong year")).getByRole("button", { name: "Delete" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    const [[url, opts]] = writes();
    expect(url).toBe("/api/requests/o1");
    expect(opts.method).toBe("DELETE");
  });
});
