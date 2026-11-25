// Movie detail page - the browser tab title and the table of contents,
// as Anime.contents.test.jsx pins them for the anime page.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../../contexts/AuthContext";
import { PageTitleProvider } from "../../contexts/PageTitleContext";
import { ToastProvider } from "../../hooks/useToast";
import Movie from "./Movie";

const ENTRY = {
  system_id: "e1",
  public_id: 1,
  franchise_id: null,
  series_id: null,
  cover_image_file: null,
  sources: [],
  content_labels: [],
  credit_refs: {},
  movie_name_cn: "測試電影",
  movie_name_en: "Test Movie",
  movie_name_alt: null,
  release_status: "Released",
  movie_type: "Reality",
  length_min: 171,
  watching_status: "Completed",
  genre_main: "Drama",
};

const ok = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

// A member with a list of their own (self.list), so the tracker is drawn.
function mockFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => {
      const u = String(url);
      if (u.startsWith("/api/movies/")) return ok(ENTRY);
      if (u.startsWith("/api/auth/me")) {
        return ok({
          username: "reader",
          role: "user",
          permissions: ["view.character", "self.list"],
        });
      }
      return ok([]);
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={["/movie/1"]}>
            <PageTitleProvider>
              <Routes>
                <Route path="/movie/:publicId/:slug?" element={<Movie />} />
              </Routes>
            </PageTitleProvider>
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const rows = () =>
  within(screen.getByRole("navigation", { name: "Contents" }))
    .getAllByRole("button")
    .map((b) => b.textContent);

describe("Movie detail page - tab title and contents", () => {
  it("titles the tab with the entry's displayed title, the one the heading shows", async () => {
    mockFetch();
    mount();
    await screen.findByRole("heading", { level: 1, name: "測試電影" });
    await waitFor(() => expect(document.title).toBe("測試電影"));
  });

  it("lists the main-column sections in page order", async () => {
    mockFetch();
    mount();
    await waitFor(() =>
      expect(rows()).toEqual(["My tracker", "Naming", "Information", "Genres"]),
    );
  });
});

describe("Movie detail page - release status", () => {
  it("shows Release Status in the Information card, not Airing Status", async () => {
    mockFetch();
    mount();
    const heading = await screen.findByRole("heading", { level: 3, name: "Information" });
    const card = within(heading.closest("section"));
    expect(card.getByText("Release Status")).toBeInTheDocument();
    expect(card.getByText("Released")).toBeInTheDocument();
    expect(card.queryByText("Airing Status")).toBeNull();
  });

  it("draws no eyebrow line above the title", async () => {
    mockFetch();
    mount();
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByText(/Movie\s+·\s+Reality/)).toBeNull();
    // The same facts are still on the page, on the Information card.
    expect(screen.getByText("Reality")).toBeInTheDocument();
    expect(screen.getByText("2hr 51min")).toBeInTheDocument();
  });

  // 本傳 / 外傳 beside Movie Type, Director beside Runtime, and Release Status
  // leading the two release dates.
  it("lays the Information card out in three rows", async () => {
    mockFetch();
    mount();
    const heading = await screen.findByRole("heading", { level: 3, name: "Information" });
    const card = within(heading.closest("section"));
    const rowOf = (label) => card.getByText(label).closest(".grid");
    const labelsIn = (row) =>
      ["本傳 / 外傳", "Movie Type", "Director", "Runtime", "Release Status",
        "Release Date TW", "Release Date USA"].filter((l) => row.contains(card.getByText(l)));
    expect(labelsIn(rowOf("本傳 / 外傳"))).toEqual(["本傳 / 外傳", "Movie Type"]);
    expect(labelsIn(rowOf("Director"))).toEqual(["Director", "Runtime"]);
    expect(labelsIn(rowOf("Release Status"))).toEqual([
      "Release Status",
      "Release Date TW",
      "Release Date USA",
    ]);
  });
});

// No eyebrow line above the title: the type, status and dates it repeated are
// on the Information card, and the breadcrumb names the type. The title's
// block is the first thing in the header.
it("draws nothing above the title", async () => {
  mockFetch();
  mount();
  const title = await screen.findByRole("heading", { level: 1 });
  const header = title.closest("header");
  expect(header.firstElementChild.contains(title)).toBe(true);
});
