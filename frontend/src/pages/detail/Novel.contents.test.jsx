// Novel detail page - the browser tab title and the table of contents, the
// two mechanisms every media-type detail page shares (usePageTitle,
// DetailContents / TocSection). Anime.contents.test.jsx pins the loading,
// not-found and left-out-section cases; this pins Novel's own sections.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../../contexts/AuthContext";
import { PageTitleProvider } from "../../contexts/PageTitleContext";
import { ToastProvider } from "../../hooks/useToast";
import Novel from "./Novel";

// Every optional main-column card has something to show: genre tags, an
// author for Production, a remark, one unit and one cast row.
const NOVEL = {
  system_id: "n1",
  public_id: 1,
  novel_name_cn: "測試小說",
  novel_name_en: "Test Novel",
  novel_name_roman: null,
  franchise_id: null,
  series_id: null,
  region: "JP",
  type: "Web",
  genre_main: "Fantasy",
  author: "Author",
  ch_fin: 3,
  ch_total: 10,
  remark: "My remark",
  cover_image_file: null,
  units: [{ system_id: "u1", display_key: "Vol. 1", unit_kind: "volume", position: 1 }],
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

function mockFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => {
      const u = String(url);
      if (u.startsWith("/api/casting/novel/")) return ok({ cast: [CAST_ROW] });
      if (u.startsWith("/api/novel/")) return ok(NOVEL);
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
          <MemoryRouter initialEntries={["/novel/1"]}>
            <PageTitleProvider>
              <Routes>
                <Route path="/novel/:publicId/:slug?" element={<Novel />} />
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

describe("Novel detail page - tab title", () => {
  it("is the entry's displayed title, the one the heading shows", async () => {
    mockFetch();
    mount();
    await screen.findByRole("heading", { level: 1, name: "測試小說" });
    await waitFor(() => expect(document.title).toBe("測試小說"));
  });
});

describe("Novel detail page - table of contents", () => {
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
        "Remarks",
        "Units",
      ]),
    );
  });
});
