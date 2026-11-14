// Anime detail page - the browser tab title and the table of contents. Anime
// stands for the twelve media-type detail pages, which share both mechanisms
// (usePageTitle, DetailContents / TocSection).
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../../contexts/AuthContext";
import { PageTitleProvider } from "../../contexts/PageTitleContext";
import { ToastProvider } from "../../hooks/useToast";
import Anime from "./Anime";

const ANIME = {
  system_id: "a1",
  public_id: 1,
  anime_name_cn: "測試動畫",
  anime_name_en: "Test Anime",
  anime_name_roman: null,
  franchise_id: null,
  series_id: null,
  airing_type: "TV",
  ep_fin: 1,
  ep_total: 12,
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

// `anime: null` answers the entry's fetch 404; `pending` never answers it. A
// member with a list (self.list) has a tracker; `member: false` is a guest.
function mockFetch({ anime = ANIME, cast = [], pending = false, member = true } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => {
      const u = String(url);
      if (u.startsWith("/api/casting/anime/")) return ok({ cast });
      if (u.startsWith("/api/anime/")) {
        if (pending) return new Promise(() => {});
        if (!anime) {
          return Promise.resolve({
            ok: false,
            status: 404,
            json: () => Promise.resolve({ detail: "Not found" }),
          });
        }
        return ok(anime);
      }
      if (u.startsWith("/api/auth/me")) {
        return ok(
          member
            ? { username: "reader", role: "user", permissions: ["view.character", "self.list"] }
            : { username: null, role: "guest", permissions: [] },
        );
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
          <MemoryRouter initialEntries={["/anime/1"]}>
            <PageTitleProvider>
              <Routes>
                <Route path="/anime/:publicId/:slug?" element={<Anime />} />
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

describe("Anime detail page - tab title", () => {
  it("is the entry's displayed title, the one the heading shows", async () => {
    mockFetch();
    mount();
    await screen.findByRole("heading", { level: 1, name: "測試動畫" });
    await waitFor(() => expect(document.title).toBe("測試動畫"));
  });

  it("is the type's name while the entry loads", async () => {
    mockFetch({ pending: true });
    mount();
    await screen.findByText("Loading details...");
    expect(document.title).toBe("Anime");
  });

  it("is the type's name when the entry is not found", async () => {
    mockFetch({ anime: null });
    mount();
    await screen.findByText("Error Loading Anime");
    expect(document.title).toBe("Anime");
  });
});

describe("Anime detail page - table of contents", () => {
  it("lists the main-column sections in page order", async () => {
    mockFetch({ cast: [CAST_ROW] });
    mount();
    await screen.findByText("Protagonist");
    await waitFor(() =>
      expect(rows()).toEqual(["My tracker", "Naming", "Information", "Production", "Cast"]),
    );
  });

  // The mirror of the case above: the same page with nobody cast. Cast is
  // listed above only because it rendered.
  it("leaves out a section that rendered nothing for this entry", async () => {
    mockFetch({ cast: [] });
    mount();
    await waitFor(() => expect(rows()).toContain("Production"));
    expect(rows()).not.toContain("Cast");
    // The followed-orders band is empty for this viewer too.
    expect(rows()).not.toContain("Watch orders");
  });

  it("leaves out the tracker for a viewer with no list of their own", async () => {
    mockFetch({ member: false });
    mount();
    await waitFor(() => expect(rows()).toContain("Naming"));
    expect(rows()).not.toContain("My tracker");
  });
});
