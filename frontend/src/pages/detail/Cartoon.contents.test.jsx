// Cartoon detail page - the browser tab title and the table of contents,
// as Anime.contents.test.jsx pins them for the anime page.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../../contexts/AuthContext";
import { PageTitleProvider } from "../../contexts/PageTitleContext";
import { ToastProvider } from "../../hooks/useToast";
import Cartoon from "./Cartoon";

const ENTRY = {
  system_id: "e1",
  public_id: 1,
  franchise_id: null,
  series_id: null,
  cover_image_file: null,
  sources: [],
  content_labels: [],
  credit_refs: {},
  cartoon_name_cn: "測試卡通",
  cartoon_name_en: "Test Cartoon",
  cartoon_name_alt: null,
  airing_status: "Airing",
  watching_status: "Active Watching",
  ep_fin: 3,
  ep_total: 10,
  genre_main: "Comedy",
};

const ok = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

// A member with a list of their own (self.list), so the tracker is drawn.
function mockFetch(entry = ENTRY) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => {
      const u = String(url);
      if (u.startsWith("/api/cartoon/")) return ok(entry);
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
          <MemoryRouter initialEntries={["/cartoon/1"]}>
            <PageTitleProvider>
              <Routes>
                <Route path="/cartoon/:publicId/:slug?" element={<Cartoon />} />
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

describe("Cartoon detail page - tab title and contents", () => {
  it("titles the tab with the entry's displayed title, the one the heading shows", async () => {
    mockFetch();
    mount();
    await screen.findByRole("heading", { level: 1, name: "測試卡通" });
    await waitFor(() => expect(document.title).toBe("測試卡通"));
  });

  it("lists the main-column sections in page order", async () => {
    mockFetch();
    mount();
    await waitFor(() =>
      expect(rows()).toEqual(["My tracker", "Naming", "Information", "Genres"]),
    );
  });
});

// 本傳 / 外傳, Airing Type and Season; then Airing Status and Release Date;
// then Total Ep and Runtime. Season is left out when it is unset.
describe("Cartoon detail page - Information card", () => {
  const FULL = {
    ...ENTRY,
    is_main: "本傳",
    airing_type: "TV",
    season_part: "Season 2",
    airing_status: "Airing",
    release_date: "2024-04-01",
    ep_total: 12,
    runtime_min: 22,
  };
  const LABELS = [
    "本傳 / 外傳", "Airing Type", "Season", "Airing Status", "Release Date",
    "Total Ep", "Runtime Per Ep (min)",
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
    expect(labelsIn(rowOf("本傳 / 外傳"))).toEqual(["本傳 / 外傳", "Airing Type", "Season"]);
    expect(labelsIn(rowOf("Airing Status"))).toEqual(["Airing Status", "Release Date"]);
    expect(labelsIn(rowOf("Total Ep"))).toEqual(["Total Ep", "Runtime Per Ep (min)"]);
  });

  it("leaves Season out when it is unset", async () => {
    mockFetch({ ...FULL, season_part: null });
    mount();
    const c = await card();
    expect(c.queryByText("Season")).toBeNull();
    expect(c.getByText("Airing Type")).toBeInTheDocument();
  });
});
