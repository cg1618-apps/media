// TV show detail page - the browser tab title and the table of contents,
// as Anime.contents.test.jsx pins them for the anime page.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../../contexts/AuthContext";
import { PageTitleProvider } from "../../contexts/PageTitleContext";
import { ToastProvider } from "../../hooks/useToast";
import TV from "./TV";

const ENTRY = {
  system_id: "e1",
  public_id: 1,
  franchise_id: null,
  series_id: null,
  cover_image_file: null,
  sources: [],
  content_labels: [],
  credit_refs: {},
  tv_name_cn: "測試劇",
  tv_name_en: "Test Show",
  tv_name_alt: null,
  airing_status: "Airing",
  watching_status: "Active Watching",
  ep_fin: 3,
  ep_total: 10,
  genre_main: "Drama",
};

const ok = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

// A member with a list of their own (self.list), so the tracker is drawn.
function mockFetch(entry = ENTRY) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => {
      const u = String(url);
      if (u.startsWith("/api/tv-shows/")) return ok(entry);
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
          <MemoryRouter initialEntries={["/tv-show/1"]}>
            <PageTitleProvider>
              <Routes>
                <Route path="/tv-show/:publicId/:slug?" element={<TV />} />
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

describe("TV detail page - tab title and contents", () => {
  it("titles the tab with the entry's displayed title, the one the heading shows", async () => {
    mockFetch();
    mount();
    await screen.findByRole("heading", { level: 1, name: "測試劇" });
    await waitFor(() => expect(document.title).toBe("測試劇"));
  });

  it("lists the main-column sections in page order", async () => {
    mockFetch();
    mount();
    await waitFor(() =>
      expect(rows()).toEqual(["My tracker", "Naming", "Information", "Genres"]),
    );
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

// Region, 本傳 / 外傳 and Season; then Airing Type, Airing Status and Release
// Date; then Total Ep and Runtime. Season is left out when it is unset.
describe("TV detail page - Information card", () => {
  const FULL = {
    ...ENTRY,
    region: "歐美劇",
    is_main: "本傳",
    season_part: "Season 5",
    airing_type: "TV",
    release_date: "2012-07-15",
    runtime_min: 47,
  };
  const LABELS = [
    "Region", "本傳 / 外傳", "Season", "Airing Type", "Airing Status",
    "Release Date", "Total Ep", "Runtime (min)",
  ];

  async function card() {
    const heading = await screen.findByRole("heading", { level: 3, name: "Information" });
    return within(heading.closest("section"));
  }

  it("lays the card out in three rows", async () => {
    mockFetch(FULL);
    mount();
    const c = await card();
    const rowOf = (label) => c.getByText(label).closest(".grid");
    const labelsIn = (row) => LABELS.filter((l) => row.contains(c.getByText(l)));
    expect(labelsIn(rowOf("Region"))).toEqual(["Region", "本傳 / 外傳", "Season"]);
    expect(labelsIn(rowOf("Airing Type"))).toEqual(["Airing Type", "Airing Status", "Release Date"]);
    expect(labelsIn(rowOf("Total Ep"))).toEqual(["Total Ep", "Runtime (min)"]);
    expect(c.getByText("歐美劇")).toBeInTheDocument();
    expect(c.getByText("Season 5")).toBeInTheDocument();
  });

  it("leaves Season out when it is unset", async () => {
    mockFetch({ ...FULL, season_part: null });
    mount();
    const c = await card();
    expect(c.queryByText("Season")).toBeNull();
    expect(c.getByText("Region")).toBeInTheDocument();
    expect(c.getByText("本傳 / 外傳")).toBeInTheDocument();
  });
});
