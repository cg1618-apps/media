// Frontend: an entry's save creates the franchise and series it names.
//
// An Anime typed with a franchise and a series that do not exist asks once,
// showing the names each will get - the entry's, editable - and the
// franchise's types, the implied one locked on. Confirming creates the
// franchise with the edited names and types, then the series under it, then
// the entry in both; cancelling creates nothing.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Add from "./Add";
import * as notesApi from "../notes/api";

vi.mock("../notes/api");

const showToast = vi.fn();
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast }),
}));

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    has: () => true,
    visibleGatedTypes: [],
    user: { username: "admin" },
    modes: [],
  }),
}));

function json(body) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
}

function mockFetch() {
  return vi.fn((url, options = {}) => {
    const u = String(url);
    const method = options.method || "GET";
    if (u === "/api/franchise/" && method === "POST")
      return json({ system_id: "f-new", franchise_name_en: "Edited Franchise" });
    if (u === "/api/series/" && method === "POST")
      return json({ system_id: "s-new", series_name_en: "Edited Series" });
    if (u === "/api/anime/" && method === "POST")
      return json({ system_id: "a-new", anime_name_en: "Test Anime" });
    return json([]);
  });
}

const posts = (path) =>
  fetch.mock.calls.filter(([url, opts]) => String(url) === path && opts?.method === "POST");
const bodyOf = (path) => JSON.parse(posts(path)[0][1].body);

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Add />
    </QueryClientProvider>,
  );
}

async function fillAnimeWithNewGroups(user) {
  await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());
  await user.type(screen.getByPlaceholderText("English title"), "Test Anime");
  await user.type(screen.getByPlaceholderText("Search or type new franchise..."), "Brand New");
  await user.type(screen.getByPlaceholderText("Search or type new series..."), "New Saga");
  await user.click(screen.getByRole("button", { name: /append entry/i }));
  return screen.findByRole("dialog", { name: "Create new franchise and series" });
}

beforeEach(() => {
  showToast.mockReset();
  vi.mocked(notesApi.fetchSections).mockResolvedValue([]);
  vi.mocked(notesApi.fetchNotes).mockResolvedValue([]);
  vi.stubGlobal("fetch", mockFetch());
  vi.stubGlobal("scrollTo", vi.fn());
});

describe("Add page — quick-creating the franchise and series", () => {
  it("asks once, with the entry's names filled in, and creates nothing yet", async () => {
    const user = userEvent.setup();
    mount();
    const dialog = await fillAnimeWithNewGroups(user);
    expect(within(dialog).getByLabelText("Franchise name EN")).toHaveValue("Test Anime");
    expect(within(dialog).getByLabelText("Series name EN")).toHaveValue("Test Anime");
    expect(within(dialog).getByText("New Saga")).toBeInTheDocument();
    const anime = within(dialog).getByRole("checkbox", { name: "Anime" });
    expect(anime).toBeChecked();
    expect(anime).toBeDisabled();
    // Only the mainstream family is offered for an anime's franchise.
    expect(within(dialog).queryByRole("checkbox", { name: "H-Comic" })).not.toBeInTheDocument();
    expect(posts("/api/franchise/")).toHaveLength(0);
    expect(posts("/api/series/")).toHaveLength(0);
  });

  it("creates both with the edited names and the added type, then the entry in them", async () => {
    const user = userEvent.setup();
    mount();
    const dialog = await fillAnimeWithNewGroups(user);
    const franchiseEn = within(dialog).getByLabelText("Franchise name EN");
    await user.clear(franchiseEn);
    await user.type(franchiseEn, "Edited Franchise");
    const seriesEn = within(dialog).getByLabelText("Series name EN");
    await user.clear(seriesEn);
    await user.type(seriesEn, "Edited Series");
    await user.click(within(dialog).getByRole("checkbox", { name: "Manga" }));
    await user.click(within(dialog).getByRole("button", { name: "Create and proceed" }));

    await waitFor(() => expect(posts("/api/anime/")).toHaveLength(1));
    expect(bodyOf("/api/franchise/")).toMatchObject({
      franchise_name_en: "Edited Franchise",
      franchise_type: "Anime, Manga",
    });
    expect(bodyOf("/api/series/")).toMatchObject({
      franchise_id: "f-new",
      series_name_en: "Edited Series",
    });
    expect(bodyOf("/api/anime/")).toMatchObject({ franchise_id: "f-new", series_id: "s-new" });
  });

  it("creates nothing when cancelled", async () => {
    const user = userEvent.setup();
    mount();
    const dialog = await fillAnimeWithNewGroups(user);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(posts("/api/franchise/")).toHaveLength(0);
    expect(posts("/api/series/")).toHaveLength(0);
    expect(posts("/api/anime/")).toHaveLength(0);
  });
});
