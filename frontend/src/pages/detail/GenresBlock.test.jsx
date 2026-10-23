// The five detail pages that set Genre (Main), Genre (Sub) and 標籤 Label in
// a Genres card of their own (GenresCard) rather than inside the Information
// card: the tags sit in the Genres card and not in Information, and with no
// tag set there is no Genres card at all.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MEDIA_CONFIG } from "../../config/mediaRegistry";
import { AuthProvider } from "../../contexts/AuthContext";
import { ToastProvider } from "../../hooks/useToast";
import Cartoon from "./Cartoon";
import Manga from "./Manga";
import Movie from "./Movie";
import Novel from "./Novel";
import TV from "./TV";

const PAGES = [
  { name: "Manga", type: "manga", Page: Manga },
  { name: "Novel", type: "novel", Page: Novel, entry: { units: [] } },
  { name: "Movie", type: "movie", Page: Movie },
  { name: "TV", type: "tv-show", Page: TV },
  { name: "Cartoon", type: "cartoon", Page: Cartoon },
];

const TAGS = { genre_main: "Fantasy, Romance", genre_sub: "Isekai", label: "必看" };
const NO_TAGS = { genre_main: null, genre_sub: "", label: null };

// The item URL comes from the registry (`/api/movies`, `/api/tv-shows`), not
// the route segment; an unmatched URL answers [] and the page then renders an
// empty entry - which would let the no-tags case pass without a page.
const itemUrl = (type) => `${MEDIA_CONFIG[type].apiEndpoint}/x1`;

function mockFetch(type, entry) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => {
      const u = String(url);
      let body = [];
      if (u.startsWith(itemUrl(type))) body = entry;
      else if (u.startsWith("/api/auth/me")) {
        body = { is_admin: false, username: null, role: "guest", is_root: false, permissions: [] };
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

function mount(type, Page) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[`/${type}/x1`]}>
            <Routes>
              <Route path={`/${type}/:publicId/:slug?`} element={<Page />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const card = (title) => screen.getByRole("heading", { name: title }).closest("section");

describe.each(PAGES)("$name detail page — Genres card", ({ type, Page, entry }) => {
  const base = { system_id: "x1", public_id: "x1", remark: null, ...entry };

  it("shows the tags in the Genres card, not in Information", async () => {
    mockFetch(type, { ...base, ...TAGS });
    mount(type, Page);
    await screen.findByRole("heading", { name: "Information" });

    const genres = card("Genres");
    for (const text of ["Genre (Main)", "Fantasy, Romance", "Genre (Sub)", "Isekai", "標籤 Label", "必看"]) {
      expect(within(genres).getByText(text)).toBeInTheDocument();
      expect(screen.getAllByText(text)).toHaveLength(1);
    }
    const info = card("Information");
    expect(within(info).queryByText("Genre (Main)")).not.toBeInTheDocument();
    expect(within(info).queryByText("標籤 Label")).not.toBeInTheDocument();
  });

  it("renders no Genres card when no tag is set", async () => {
    mockFetch(type, { ...base, ...NO_TAGS });
    mount(type, Page);
    await screen.findByRole("heading", { name: "Information" });
    // The entry itself was served, so the absence below is the card's doing.
    expect(fetch.mock.calls.some(([url]) => String(url).startsWith(itemUrl(type)))).toBe(true);
    expect(screen.queryByRole("heading", { name: "Genres" })).not.toBeInTheDocument();
    expect(screen.queryByText("Genre (Main)")).not.toBeInTheDocument();
  });
});
