// Frontend: a Modify save sends back what the entry already holds. The entry
// endpoints keep an explicit null (PATCH writes it, PUT replaces), so a field
// the editor never loaded into its form state goes out as null and wipes the
// stored value - silently, on every save, for a field the admin never touched.
// These open an entry by deep link (?type=&id=), press Save, and read the
// body the page sent.
import { render, screen, waitFor } from "@testing-library/react";
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
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  });

// `listPath` is the type's list endpoint, `entryPath` its row endpoint.
// `credits` is what GET /api/credits/{type}/{id} answers, when it matters.
function mockFetch(listPath, entryPath, entry, credits) {
  return vi.fn((url, options = {}) => {
    const u = String(url);
    const method = options.method || "GET";
    if (method === "GET" && u.startsWith(`${listPath}/?`)) return ok([entry]);
    if (method === "GET" && credits && u.startsWith("/api/credits/"))
      return ok(credits);
    if ((method === "PATCH" || method === "PUT") && u === entryPath)
      return ok(entry);
    // Credits, cast, sources, form defaults, enrichment, the other lists:
    // irrelevant to what the save sends.
    return ok([]);
  });
}

beforeEach(() => {
  showToast.mockReset();
  vi.mocked(notesApi.fetchSections).mockResolvedValue([]);
  vi.mocked(notesApi.fetchNotes).mockResolvedValue([]);
});

async function saveAndReadBody({ type, listPath, entry, credits }) {
  const entryPath = `${listPath}/${entry.system_id}`;
  const fetchMock = mockFetch(listPath, entryPath, entry, credits);
  vi.stubGlobal("fetch", fetchMock);
  const user = userEvent.setup();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/modify?type=${type}&id=${entry.system_id}`]}>
        <Modify />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const save = await screen.findByRole("button", { name: /save changes/i });
  // The credits merge lands after the editor opens; a save before it would
  // not carry them.
  if (credits)
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url).startsWith("/api/credits/"),
        ),
      ).toBe(true),
    );
  await user.click(save);
  let call;
  await waitFor(() => {
    call = fetchMock.mock.calls.find(
      ([url, opts]) =>
        String(url) === entryPath &&
        (opts?.method === "PATCH" || opts?.method === "PUT"),
    );
    expect(call).toBeTruthy();
  });
  vi.unstubAllGlobals();
  return { body: JSON.parse(call[1].body), fetchMock };
}

const RANKS = { anilist_rank: 120, anilist_popularity_rank: 45 };

describe("Modify save keeps what the entry holds", () => {
  it.each([
    ["anime", "/api/anime", { anime_name_en: "A" }],
    ["anime-movie", "/api/anime-movie", { anime_movie_name_en: "AM" }],
    ["manga", "/api/manga", { manga_name_en: "M" }],
    ["novel", "/api/novel", { novel_name_en: "N" }],
  ])("%s keeps its AniList ranks", async (type, listPath, names) => {
    const { body } = await saveAndReadBody({
      type,
      listPath,
      entry: { system_id: `${type}-1`, ...names, ...RANKS },
    });
    expect(body.anilist_rank).toBe(120);
    expect(body.anilist_popularity_rank).toBe(45);
  });

  // mal_rank is a string column ("#1234" as MAL prints it); parsing it as a
  // number turns that into NaN, which JSON sends as null.
  it.each([
    ["manga", "/api/manga", { manga_name_en: "M" }],
    ["novel", "/api/novel", { novel_name_en: "N" }],
  ])("%s keeps its MAL rank as text", async (type, listPath, names) => {
    const { body } = await saveAndReadBody({
      type,
      listPath,
      entry: { system_id: `${type}-1`, ...names, mal_rank: "#1234" },
    });
    expect(body.mal_rank).toBe("#1234");
  });

  it("movie keeps its IMDb rating", async () => {
    const { body } = await saveAndReadBody({
      type: "movie",
      listPath: "/api/movies",
      entry: { system_id: "movie-1", movie_name_en: "Mv", imdb_rating: "7.8" },
    });
    expect(body.imdb_rating).toBe("7.8");
  });

  it("comic keeps its Comic Vine id", async () => {
    const { body } = await saveAndReadBody({
      type: "comic",
      listPath: "/api/comic",
      entry: {
        system_id: "comic-1",
        comic_name_en: "C",
        comicvine_id: 4050,
        comicvine_link: "https://comicvine.gamespot.com/x/4050-4050/",
      },
    });
    expect(body.comicvine_id).toBe(4050);
  });

  // Every other genre-carrying type quick-creates a typed genre or label the
  // vocabulary does not hold yet; anime has to as well, scoped to anime.
  it("anime creates a genre it does not know yet", async () => {
    const { fetchMock } = await saveAndReadBody({
      type: "anime",
      listPath: "/api/anime",
      entry: { system_id: "anime-1", anime_name_en: "A" },
      credits: { credits: {}, tags: { genre_main: ["Brand New Genre"] } },
    });
    await waitFor(() => {
      const created = fetchMock.mock.calls
        .filter(
          ([url, opts]) =>
            String(url) === "/api/options/" && opts?.method === "POST",
        )
        .map(([, opts]) => JSON.parse(opts.body));
      expect(created).toContainEqual(
        expect.objectContaining({
          category: "Genre Main",
          value: "Brand New Genre",
          scopes: ["anime"],
        }),
      );
    });
  });
});
