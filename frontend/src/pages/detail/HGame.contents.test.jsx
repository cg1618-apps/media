// H-Game detail page - the browser tab title and the table of contents, the
// two mechanisms every media-type detail page shares (usePageTitle,
// DetailContents / TocSection). Anime.contents.test.jsx pins the loading,
// not-found and left-out-section cases; this pins H-Game's own sections.
// H-Game is a gated type, so the viewer is one it is visible to.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../../contexts/AuthContext";
import { PageTitleProvider } from "../../contexts/PageTitleContext";
import { ToastProvider } from "../../hooks/useToast";
import HGame from "./HGame";

// Every optional main-column card has something to show: a time-to-beat
// estimate, a copy and a remark.
const ENTRY = {
  // No public_id: useCanonicalPath would otherwise rewrite the URL to it,
  // and the mock below answers for the system_id only.
  system_id: "hg1",
  h_game_name_en: "Aitch Game",
  franchise_id: null,
  series_id: null,
  cover_image_file: null,
  sources: [],
  content_labels: [],
  credit_refs: {},
  hltb_main: 40,
  copies: [{ system_id: "c1", position: 1, storefront: "Steam" }],
  remark: "My remark",
};

const ok = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

function mockFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => {
      const u = String(url);
      if (u.startsWith("/api/h-game/hg1")) return ok(ENTRY);
      if (u.startsWith("/api/auth/me")) {
        return ok({
          username: "reader",
          role: "user",
          permissions: ["view.character", "self.list"],
          visible_gated_types: ["h-comic", "h-game"],
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
          <MemoryRouter initialEntries={["/h-game/hg1"]}>
            <PageTitleProvider>
              <Routes>
                <Route path="/h-game/:publicId/:slug?" element={<HGame />} />
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

describe("H-Game detail page - tab title", () => {
  it("is the entry's displayed title, the one the heading shows", async () => {
    mockFetch();
    mount();
    await screen.findByRole("heading", { level: 1, name: "Aitch Game" });
    await waitFor(() => expect(document.title).toBe("Aitch Game"));
  });
});

describe("H-Game detail page - table of contents", () => {
  it("lists the main-column sections in page order", async () => {
    mockFetch();
    mount();
    await screen.findByRole("heading", { level: 1, name: "Aitch Game" });
    await waitFor(() =>
      expect(rows()).toEqual([
        "My tracker",
        "Completion",
        "進度/待辦 Progress and Todo",
        "分歧 Choices",
        "Naming",
        "Information",
        "Genres",
        "Presentation",
        "Production & Release",
        "Time to Beat",
        "Prices",
        "Library",
        "Copies",
        "Remarks",
      ]),
    );
  });
});
