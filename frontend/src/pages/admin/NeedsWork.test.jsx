// The Needs Work page: marks grouped by note with the unnoted group last,
// each row linking to its owner's page; Edit note and Clear reach the one
// endpoint the server gates them on, and Clear sends nothing until confirmed.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import NeedsWork from "./NeedsWork";

vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const item = (ownerType, ownerId, typeLabel, name, note, isTier = false) => ({
  owner_type: ownerType,
  owner_id: ownerId,
  type_label: typeLabel,
  is_tier: isTier,
  display_name: name,
  nav_path: `/${ownerType}/${ownerId}`,
  note,
  created_at: "2026-11-19T10:00:00",
  updated_at: "2026-11-19T10:00:00",
});

const GROUPS = [
  {
    note: "續集未補",
    items: [
      item("anime", "a1", "Anime", "Frieren", "續集未補"),
      item("franchise", "f1", "Franchise", "Dandadan", "續集未補", true),
    ],
  },
  { note: null, items: [item("series", "s1", "Series", "Solo Leveling", null, true)] },
];

let groups;

beforeEach(() => {
  groups = GROUPS;
  vi.stubGlobal(
    "fetch",
    vi.fn((url, opts) => {
      if (opts?.method === "DELETE") return Promise.resolve({ ok: true, status: 204 });
      if (opts?.method === "PUT")
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      const body = url.endsWith("/notes") ? [{ note: "續集未補", count: 2 }] : groups;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
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
        <NeedsWork />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const writes = () =>
  global.fetch.mock.calls.filter(([, opts]) => opts?.method && opts.method !== "GET");

describe("the Needs Work page", () => {
  it("groups the marks by note, the unnoted group last", async () => {
    renderPage();
    await screen.findByText("Frieren");
    const sections = screen.getAllByTestId("needs-work-group");
    expect(sections.map((s) => s.getAttribute("aria-label"))).toEqual(["續集未補", "No note"]);
    expect(within(sections[0]).getAllByTestId("needs-work-row")).toHaveLength(2);
    expect(screen.getByText("Frieren").closest("a")).toHaveAttribute("href", "/anime/a1");
    expect(screen.getByText("Solo Leveling").closest("a")).toHaveAttribute(
      "href",
      "/series/s1",
    );
  });

  it("says so when nothing is marked", async () => {
    groups = [];
    renderPage();
    expect(await screen.findByText(/Nothing is marked/)).toBeInTheDocument();
  });

  it("changes a mark's note", async () => {
    const user = userEvent.setup();
    renderPage();
    const row = (await screen.findByText("Solo Leveling")).closest("tr");
    await user.click(within(row).getByRole("button", { name: "Edit note" }));
    await user.type(screen.getByLabelText("Note (optional)"), "名字缺");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    const [url, opts] = writes()[0];
    expect(url).toBe("/api/needs-work/series/s1");
    expect(opts.method).toBe("PUT");
    expect(JSON.parse(opts.body)).toEqual({ note: "名字缺" });
  });

  it("clears a mark only once the confirm is pressed", async () => {
    const user = userEvent.setup();
    renderPage();
    const row = (await screen.findByText("Frieren")).closest("tr");
    await user.click(within(row).getByRole("button", { name: "Clear" }));
    expect(writes()).toHaveLength(0);

    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0][0]).toBe("/api/needs-work/anime/a1");
    expect(writes()[0][1].method).toBe("DELETE");
  });
});
