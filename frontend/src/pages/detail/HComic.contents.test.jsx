// H-Comic detail page - the browser tab title and the table of contents, the
// two mechanisms every media-type detail page shares (usePageTitle,
// DetailContents / TocSection). Anime.contents.test.jsx pins the loading,
// not-found and left-out-section cases; this pins H-Comic's own sections.
// H-Comic is a gated type, so the viewer is one it is visible to.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../../contexts/AuthContext";
import { PageTitleProvider } from "../../contexts/PageTitleContext";
import { ToastProvider } from "../../hooks/useToast";
import HComic from "./HComic";

// A remark and one cast row, so every optional main-column card shows.
const H_COMIC = {
  // No public_id: useCanonicalPath would otherwise rewrite the URL to it,
  // and the mock below answers for the system_id only.
  system_id: "hc1",
  h_comic_name_en: "Aitch Comic",
  franchise_id: null,
  series_id: null,
  region: "JP",
  cover_image_file: null,
  sources: [],
  content_labels: [],
  credit_refs: {},
  remark: "My remark",
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
      if (u.startsWith("/api/casting/")) return ok({ cast: [CAST_ROW] });
      if (u.startsWith("/api/h-comic/hc1")) return ok(H_COMIC);
      if (u.startsWith("/api/auth/me")) {
        return ok({
          username: "reader",
          role: "user",
          permissions: ["view.character", "self.list"],
          visible_gated_types: ["h-comic"],
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
          <MemoryRouter initialEntries={["/h-comic/hc1"]}>
            <PageTitleProvider>
              <Routes>
                <Route path="/h-comic/:publicId/:slug?" element={<HComic />} />
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

describe("H-Comic detail page - tab title", () => {
  it("is the entry's displayed title, the one the heading shows", async () => {
    mockFetch();
    mount();
    await screen.findByRole("heading", { level: 1, name: "Aitch Comic" });
    await waitFor(() => expect(document.title).toBe("Aitch Comic"));
  });
});

describe("H-Comic detail page - table of contents", () => {
  it("lists the main-column sections in page order", async () => {
    mockFetch();
    mount();
    await screen.findByText("Protagonist");
    await waitFor(() =>
      expect(rows()).toEqual([
        "My tracker",
        "Naming",
        "Information",
        "Credits",
        "Genres",
        "Cast",
        "Remarks",
      ]),
    );
  });
});
