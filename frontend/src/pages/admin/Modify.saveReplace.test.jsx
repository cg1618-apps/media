// Frontend: on the types whose Modify save runs the single-entry Replace
// pipeline, "Save & Replace" - and Enter in a field, which submits the form -
// saves then runs Replace, while "Save" saves the edit alone. Anime, anime
// movie, cartoon and manga run it from the browser (POST data-control/replace);
// movie and tv-show through their PUT, which "Save" sends as ?replace=false.
// A type whose save never runs Replace keeps one "Save Changes" button.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const TYPES = [
  ["anime", "/api/anime", { anime_name_en: "A" }],
  ["anime-movie", "/api/anime-movie", { anime_movie_name_en: "AM" }],
  ["cartoon", "/api/cartoon", { cartoon_name_en: "C" }],
  ["manga", "/api/manga", { manga_name_en: "M" }],
];

beforeEach(() => {
  showToast.mockReset();
  vi.mocked(notesApi.fetchSections).mockResolvedValue([]);
  vi.mocked(notesApi.fetchNotes).mockResolvedValue([]);
});

function open(type, listPath, entry) {
  const entryPath = `${listPath}/${entry.system_id}`;
  const fetchMock = vi.fn((url, options = {}) => {
    const u = String(url);
    const method = options.method || "GET";
    if (method === "GET" && u.startsWith(`${listPath}/?`)) return ok([entry]);
    if ((method === "PATCH" || method === "PUT") && u.split("?")[0] === entryPath)
      return ok(entry);
    if (method === "GET" && u.startsWith(entryPath)) return ok(entry);
    return ok([]);
  });
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/modify?type=${type}&id=${entry.system_id}`]}>
        <Modify />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const saves = () =>
    fetchMock.mock.calls.filter(
      ([url, opts]) =>
        String(url).split("?")[0] === entryPath &&
        (opts?.method === "PATCH" || opts?.method === "PUT"),
    );
  const saved = () => saves().length > 0;
  const replaced = () =>
    fetchMock.mock.calls.some(
      ([url, opts]) =>
        String(url).startsWith(`/api/data-control/replace/${type}/`) &&
        opts?.method === "POST",
    );
  return { saved, saves, replaced };
}

describe("Modify save, with and without Replace", () => {
  it.each(TYPES)("%s: Save & Replace saves, then runs Replace", async (type, listPath, names) => {
    const { saved, replaced } = open(type, listPath, { system_id: `${type}-1`, ...names });
    await userEvent.setup().click(
      await screen.findByRole("button", { name: /save & replace/i }),
    );
    await waitFor(() => expect(replaced()).toBe(true));
    expect(saved()).toBe(true);
    vi.unstubAllGlobals();
  });

  it.each(TYPES)("%s: Save saves the edit without Replace", async (type, listPath, names) => {
    const { saved, replaced } = open(type, listPath, { system_id: `${type}-1`, ...names });
    await userEvent.setup().click(await screen.findByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(saved()).toBe(true));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith("success", expect.any(String)),
    );
    // The mirror of the test above, on the same entry: the save ran, and
    // Replace did not.
    expect(replaced()).toBe(false);
    vi.unstubAllGlobals();
  });

  it("Save sits left of Save & Replace, white against its brand fill", async () => {
    open("anime", "/api/anime", { system_id: "anime-1", anime_name_en: "A" });
    const replace = await screen.findByRole("button", { name: /save & replace/i });
    const plain = screen.getByRole("button", { name: /^save$/i });
    expect(plain.nextElementSibling).toBe(replace);
    expect(plain.className).toContain("bg-raised");
    expect(replace.className).toContain("bg-brand");
    vi.unstubAllGlobals();
  });

  it("Enter in a field still saves with Replace", async () => {
    const { saved, replaced } = open("anime", "/api/anime", {
      system_id: "anime-1",
      anime_name_en: "A",
    });
    const button = await screen.findByRole("button", { name: /save & replace/i });
    // Enter in a field submits the form through its default (submit) button.
    fireEvent.submit(button.closest("form"));
    await waitFor(() => expect(replaced()).toBe(true));
    expect(saved()).toBe(true);
    vi.unstubAllGlobals();
  });

  it.each([
    ["movie", "/api/movies", { movie_name_en: "M" }],
    ["tv-show", "/api/tv-shows", { tv_name_en: "T" }],
  ])("%s: Save & Replace PUTs plainly, Save PUTs with ?replace=false", async (type, listPath, names) => {
    const { saves } = open(type, listPath, { system_id: `${type}-1`, ...names });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /save & replace/i }));
    await waitFor(() => expect(saves()).toHaveLength(1));
    expect(String(saves()[0][0])).toBe(`${listPath}/${type}-1`);
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(saves()).toHaveLength(2));
    expect(String(saves()[1][0])).toBe(`${listPath}/${type}-1?replace=false`);
    vi.unstubAllGlobals();
  });

  it("a type whose save runs no Replace keeps one Save Changes button", async () => {
    open("book", "/api/book", { system_id: "book-1", book_name_en: "B" });
    expect(await screen.findByRole("button", { name: /save changes/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save & replace/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^save$/i })).toBeNull();
    vi.unstubAllGlobals();
  });
});
