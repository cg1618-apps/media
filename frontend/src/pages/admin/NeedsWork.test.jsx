// The Needs Work page: a section per common note in the option's order, one
// Other section for every custom note (each row showing its note), the
// unnoted section last; each row linking to its owner's page; Edit note and Clear reach the one
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

// The server sends one group per distinct note, sorted by note. 名稱缺 and
// 自訂備註 are custom - not values of the Needs Work Note category - so they
// are load-bearing: without them the Other section has nothing to collect.
const GROUPS = [
  { note: "名稱缺", items: [item("game", "g1", "Game", "Elden Ring", "名稱缺")] },
  {
    note: "續集未補",
    items: [
      item("anime", "a1", "Anime", "Frieren", "續集未補"),
      item("franchise", "f1", "Franchise", "Dandadan", "續集未補", true),
    ],
  },
  { note: "官方名稱未出", items: [item("movie", "m1", "Movie", "Dune", "官方名稱未出")] },
  { note: "自訂備註", items: [item("book", "b1", "Book", "Dune Messiah", "自訂備註")] },
  { note: null, items: [item("series", "s1", "Series", "Solo Leveling", null, true)] },
];

// The Needs Work Note option values, in their sort order.
const COMMON_NOTES = [
  { system_id: "o1", value: "官方名稱未出" },
  { system_id: "o2", value: "續集未補" },
];

let groups;
let commonNotes;

beforeEach(() => {
  groups = GROUPS;
  commonNotes = COMMON_NOTES;
  vi.stubGlobal(
    "fetch",
    vi.fn((url, opts) => {
      if (opts?.method === "DELETE") return Promise.resolve({ ok: true, status: 204 });
      if (opts?.method === "PUT")
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      // /notes is load-bearing: an in-use note that is not a common one,
      // where the retired notes-in-use read lived.
      const body = url.startsWith("/api/options/")
        ? commonNotes
        : url.endsWith("/notes")
          ? [{ note: "名稱缺", count: 2 }]
          : groups;
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
  it("gives each common note a section in the option's order, then Other, then No note", async () => {
    renderPage();
    await screen.findByText("Frieren");
    const sections = screen.getAllByTestId("needs-work-group");
    expect(sections.map((s) => s.getAttribute("aria-label"))).toEqual([
      "官方名稱未出",
      "續集未補",
      "Other",
      "No note",
    ]);
    expect(within(sections[1]).getAllByTestId("needs-work-row")).toHaveLength(2);
    expect(within(sections[3]).getByText("Solo Leveling")).toBeInTheDocument();
    expect(screen.getByText("Frieren").closest("a")).toHaveAttribute("href", "/anime/a1");
    expect(screen.getByText("Solo Leveling").closest("a")).toHaveAttribute(
      "href",
      "/series/s1",
    );
  });

  it("collects every custom note into Other, each row showing its own note", async () => {
    renderPage();
    await screen.findByText("Frieren");
    const other = screen.getByRole("region", { name: "Other" });
    const rows = within(other).getAllByTestId("needs-work-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Elden Ring")).toBeInTheDocument();
    expect(within(rows[0]).getByText("名稱缺")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Dune Messiah")).toBeInTheDocument();
    expect(within(rows[1]).getByText("自訂備註")).toBeInTheDocument();
    // A common note's section names the note once, in its heading, not per row.
    const common = screen.getByRole("region", { name: "續集未補" });
    expect(within(common).getAllByText("續集未補")).toHaveLength(1);
  });

  it("puts every note in Other when there are no common notes", async () => {
    commonNotes = [];
    renderPage();
    await screen.findByText("Frieren");
    const sections = screen.getAllByTestId("needs-work-group");
    expect(sections.map((s) => s.getAttribute("aria-label"))).toEqual(["Other", "No note"]);
    expect(within(sections[0]).getAllByTestId("needs-work-row")).toHaveLength(5);
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

  it("offers the common notes in the note editor, and only those", async () => {
    const user = userEvent.setup();
    renderPage();
    const row = (await screen.findByText("Solo Leveling")).closest("tr");
    await user.click(within(row).getByRole("button", { name: "Edit note" }));

    const dialog = screen.getByRole("dialog");
    const picks = await within(dialog).findByRole("group", { name: "Common notes" });
    await user.click(within(picks).getByRole("button", { name: "官方名稱未出" }));
    expect(within(dialog).getByLabelText("Note (optional)")).toHaveValue("官方名稱未出");
    expect(within(dialog).queryByText("名稱缺")).toBeNull();
    expect(global.fetch.mock.calls.some(([url]) => url.endsWith("/notes"))).toBe(false);
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
