// Manga detail page - the browser tab title and the table of contents, the
// two mechanisms every media-type detail page shares (usePageTitle,
// DetailContents / TocSection). Anime.contents.test.jsx pins the loading,
// not-found and left-out-section cases; this pins Manga's own sections.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../../contexts/AuthContext";
import { PageTitleProvider } from "../../contexts/PageTitleContext";
import { ToastProvider } from "../../hooks/useToast";
import Manga from "./Manga";

// Every optional main-column card has something to show: genre tags, an
// author for Production, and one cast row.
const MANGA = {
  system_id: "m1",
  public_id: 1,
  manga_name_cn: "測試漫畫",
  manga_name_en: "Test Manga",
  manga_name_roman: null,
  franchise_id: null,
  series_id: null,
  region: "JP",
  genre_main: "Action",
  author_plot: "Author",
  ch_fin: 3,
  ch_total: 10,
  cover_image_file: null,
};

const CAST_ROW = {
  system_id: "cc1",
  character_id: "char-1",
  character_public_id: 1,
  character_name: "Protagonist",
  voices: [],
  role: "Main",
  position: 0,
  remark: null,
};

const ok = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

function mockFetch(entry = MANGA) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => {
      const u = String(url);
      if (u.startsWith("/api/casting/manga/")) return ok({ cast: [CAST_ROW] });
      if (u.startsWith("/api/manga/")) return ok(entry);
      if (u.startsWith("/api/auth/me")) {
        return ok({ username: "reader", role: "user", permissions: ["view.character", "self.list"] });
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
          <MemoryRouter initialEntries={["/manga/1"]}>
            <PageTitleProvider>
              <Routes>
                <Route path="/manga/:publicId/:slug?" element={<Manga />} />
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

describe("Manga detail page - tab title", () => {
  it("is the entry's displayed title, the one the heading shows", async () => {
    mockFetch();
    mount();
    await screen.findByRole("heading", { level: 1, name: "測試漫畫" });
    await waitFor(() => expect(document.title).toBe("測試漫畫"));
  });
});

describe("Manga detail page - table of contents", () => {
  it("lists the main-column sections in page order", async () => {
    mockFetch();
    mount();
    await screen.findByText("Protagonist");
    await waitFor(() =>
      expect(rows()).toEqual([
        "My tracker",
        "Naming",
        "Information",
        "Genres",
        "Production",
        "Cast",
      ]),
    );
  });
});

// Serialization Status, Release Date and End Date share a row; End Date and
// each Next Volume date are left out when unset, and the Next Volume row with
// them when both are.
describe("Manga detail page - Information card", () => {
  const FULL = {
    ...MANGA,
    region: "日漫",
    is_main: "本傳",
    serialization_status: "完結",
    release_date: "2019-02-01",
    end_date: "2024-06-01",
    next_vol_release_date_jp: "2026-12-01",
    next_vol_release_date_tw: "2027-01-15",
    vol_total: 12,
    ch_total: 100,
  };

  async function card() {
    const heading = await screen.findByRole("heading", { level: 3, name: "Information" });
    return within(heading.closest("section"));
  }

  it("puts both dates on the Serialization Status row", async () => {
    mockFetch(FULL);
    mount();
    const c = await card();
    const row = c.getByText("Serialization Status").closest(".grid");
    for (const label of ["Release Date", "End Date"]) {
      expect(row.contains(c.getByText(label))).toBe(true);
    }
    expect(c.getByText("Next Volume (JP)")).toBeInTheDocument();
    expect(c.getByText("Next Volume (TW)")).toBeInTheDocument();
  });

  it("leaves out an unset End Date and each unset Next Volume date", async () => {
    mockFetch({ ...FULL, end_date: null, next_vol_release_date_jp: null });
    mount();
    const c = await card();
    expect(c.queryByText("End Date")).toBeNull();
    expect(c.queryByText("Next Volume (JP)")).toBeNull();
    expect(c.getByText("Next Volume (TW)")).toBeInTheDocument();
    expect(c.getByText("Release Date")).toBeInTheDocument();
  });

  it("drops the Next Volume row when neither date is set", async () => {
    mockFetch({ ...FULL, next_vol_release_date_jp: null, next_vol_release_date_tw: "" });
    mount();
    const c = await card();
    expect(c.queryByText(/Next Volume/)).toBeNull();
    // No empty grid is left behind where the row was.
    const grids = [...c.getByText("Region").closest("section").querySelectorAll(".grid")];
    expect(grids.every((g) => g.children.length > 0)).toBe(true);
  });
});
