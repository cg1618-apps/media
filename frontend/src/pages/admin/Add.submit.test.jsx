// Frontend: what an Add tab's save sends, for fields the form carries but
// the save path once left out. The form state is set through the auto-fill
// box with a stubbed patch, so these do not depend on which inputs a tab's
// body draws.
//   - Movie sends imdb_rating, a string column (OMDb's "7.8"), as TV show
//     and cartoon do.
//   - Anime creates a genre or label value the admin typed that the sources
//     do not hold yet, scoped to anime, as every other genre/label type does.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Add from "./Add";
import { endpoints } from "../../api/endpoints";
import * as autofill from "../../lib/autofill";
import * as notesApi from "../notes/api";

vi.mock("../notes/api");

const showToast = vi.fn();
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast }),
}));

vi.mock("../../lib/autofill", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, buildAutofillPatch: vi.fn() };
});

const FRANCHISE = { system_id: "f1", franchise_name_en: "Test Franchise" };

function json(body) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  });
}

function mockFetch(type, source, created) {
  const listUrl = endpoints.resource(type).list();
  return vi.fn((url, options = {}) => {
    const u = String(url);
    const method = options.method || "GET";
    if (u.startsWith("/api/franchise/") && method === "GET")
      return json([FRANCHISE]);
    if (u === `${listUrl}?limit=2000`) return json([source]);
    if (u === listUrl && method === "POST") return json(created);
    return json([]);
  });
}

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Add />
    </QueryClientProvider>,
  );
}

// Opens `label`'s tab, picks `source` in the auto-fill box (which merges
// `patch` into the form), and saves.
async function autofillAndSave({ label, sourceName, patch }) {
  vi.mocked(autofill.buildAutofillPatch).mockReturnValue(patch);
  const user = userEvent.setup();
  mount();
  await waitFor(() =>
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument(),
  );
  if (label) await user.click(screen.getByRole("button", { name: label }));
  await user.type(
    screen.getByPlaceholderText(/^Auto-fill from existing entry/),
    sourceName,
  );
  await user.click(await screen.findByText(sourceName, { selector: "span" }));
  await user.click(screen.getByRole("button", { name: /append entry/i }));
}

beforeEach(() => {
  showToast.mockReset();
  vi.mocked(autofill.buildAutofillPatch).mockReset();
  vi.mocked(notesApi.fetchSections).mockResolvedValue([]);
  vi.mocked(notesApi.fetchNotes).mockResolvedValue([]);
});

describe("Add page — what a save sends", () => {
  it("movie sends its IMDb rating", async () => {
    const fetchMock = mockFetch(
      "movie",
      { system_id: "m-src", movie_name_en: "Source Movie" },
      { system_id: "m-1", movie_name_en: "New Movie" },
    );
    vi.stubGlobal("fetch", fetchMock);

    await autofillAndSave({
      label: "Movie",
      sourceName: "Source Movie",
      patch: { movie_name_en: "New Movie", imdb_rating: "7.8" },
    });

    let call;
    await waitFor(() => {
      call = fetchMock.mock.calls.find(
        ([url, opts]) =>
          String(url) === endpoints.resource("movie").list() &&
          opts?.method === "POST",
      );
      expect(call).toBeTruthy();
    });
    expect(JSON.parse(call[1].body).imdb_rating).toBe("7.8");
    vi.unstubAllGlobals();
  });

  it("movie sends a blank IMDb rating as null", async () => {
    const fetchMock = mockFetch(
      "movie",
      { system_id: "m-src", movie_name_en: "Source Movie" },
      { system_id: "m-1", movie_name_en: "New Movie" },
    );
    vi.stubGlobal("fetch", fetchMock);

    await autofillAndSave({
      label: "Movie",
      sourceName: "Source Movie",
      patch: { movie_name_en: "New Movie", imdb_rating: "" },
    });

    let call;
    await waitFor(() => {
      call = fetchMock.mock.calls.find(
        ([url, opts]) =>
          String(url) === endpoints.resource("movie").list() &&
          opts?.method === "POST",
      );
      expect(call).toBeTruthy();
    });
    expect(JSON.parse(call[1].body).imdb_rating).toBeNull();
    vi.unstubAllGlobals();
  });

  it("anime creates a typed genre and label it does not know yet, scoped to anime", async () => {
    const fetchMock = mockFetch(
      "anime",
      { system_id: "a-src", anime_name_en: "Source Anime" },
      { system_id: "a-1", anime_name_en: "New Anime" },
    );
    vi.stubGlobal("fetch", fetchMock);

    await autofillAndSave({
      label: null, // the default tab
      sourceName: "Source Anime",
      patch: {
        anime_name_en: "New Anime",
        franchise_id: "f1",
        franchise_text: "Test Franchise",
        genre_main: "Brand New Genre",
        label: "Brand New Label",
      },
    });

    const created = () =>
      fetchMock.mock.calls
        .filter(
          ([url, opts]) =>
            String(url) === endpoints.options.create() &&
            opts?.method === "POST",
        )
        .map(([, opts]) => JSON.parse(opts.body));
    await waitFor(() =>
      expect(created()).toEqual(
        expect.arrayContaining([
          { category: "Genre Main", value: "Brand New Genre", scopes: ["anime"] },
          { category: "Label", value: "Brand New Label", scopes: ["anime"] },
        ]),
      ),
    );
    vi.unstubAllGlobals();
  });
});
