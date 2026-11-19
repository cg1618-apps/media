// Frontend: a Modify save creates the franchise it names, as the Add page's
// does - one confirmation, the entry's names editable, the implied franchise
// type locked on and more of its family addable.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Modify from "./Modify";
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
  }),
}));

const ok = (body) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

const MOVIE = { system_id: "m-1", movie_name_en: "Heat", movie_name_cn: "烈火悍將" };

function mockFetch() {
  return vi.fn((url, options = {}) => {
    const u = String(url);
    const method = options.method || "GET";
    if (method === "GET" && u.startsWith("/api/movies/?")) return ok([MOVIE]);
    if (method === "POST" && u === "/api/franchise/")
      return ok({ system_id: "f-new", franchise_name_en: "Heat Saga" });
    if (method === "PUT" && u === "/api/movies/m-1") return ok(MOVIE);
    return ok([]);
  });
}

const calls = (method, path) =>
  fetch.mock.calls.filter(([url, opts]) => String(url) === path && opts?.method === method);

beforeEach(() => {
  showToast.mockReset();
  vi.mocked(notesApi.fetchSections).mockResolvedValue([]);
  vi.mocked(notesApi.fetchNotes).mockResolvedValue([]);
  vi.stubGlobal("fetch", mockFetch());
  vi.stubGlobal("scrollTo", vi.fn());
});

describe("Modify page — quick-creating the franchise", () => {
  it("creates the franchise with the edited name and types, then saves the entry in it", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/modify?type=movie&id=m-1"]}>
          <Modify />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const save = await screen.findByRole("button", { name: /save changes/i });
    await user.type(screen.getByPlaceholderText("Search or type new franchise..."), "Heat");
    await user.click(save);

    const dialog = await screen.findByRole("dialog", { name: "Create new franchise" });
    expect(within(dialog).getByLabelText("Franchise name EN")).toHaveValue("Heat");
    expect(within(dialog).getByLabelText("Franchise name CN")).toHaveValue("烈火悍將");
    const movie = within(dialog).getByRole("checkbox", { name: "Movie" });
    expect(movie).toBeChecked();
    expect(movie).toBeDisabled();
    expect(calls("POST", "/api/franchise/")).toHaveLength(0);

    const en = within(dialog).getByLabelText("Franchise name EN");
    await user.clear(en);
    await user.type(en, "Heat Saga");
    await user.click(within(dialog).getByRole("checkbox", { name: "TV" }));
    await user.click(within(dialog).getByRole("button", { name: "Create and proceed" }));

    await waitFor(() => expect(calls("PUT", "/api/movies/m-1")).toHaveLength(1));
    expect(JSON.parse(calls("POST", "/api/franchise/")[0][1].body)).toMatchObject({
      franchise_name_en: "Heat Saga",
      franchise_name_cn: "烈火悍將",
      franchise_type: "TV, Movie",
    });
    expect(JSON.parse(calls("PUT", "/api/movies/m-1")[0][1].body)).toMatchObject({
      franchise_id: "f-new",
    });
  });
});
