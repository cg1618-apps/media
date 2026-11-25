// Anime movie detail page - the browser tab title and the table of contents,
// as Anime.contents.test.jsx pins them for the anime page.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../../contexts/AuthContext";
import { PageTitleProvider } from "../../contexts/PageTitleContext";
import { ToastProvider } from "../../hooks/useToast";
import AnimeMovie from "./AnimeMovie";

const ENTRY = {
  system_id: "e1",
  public_id: 1,
  franchise_id: null,
  series_id: null,
  cover_image_file: null,
  sources: [],
  content_labels: [],
  credit_refs: {},
  anime_movie_name_cn: "測試動畫電影",
  anime_movie_name_en: "Test Anime Movie",
  anime_movie_name_roman: null,
  release_status: "Released",
  release_type: "Cinema",
  release_date_jp: "2024-07-19",
  release_date_tw: "2024-08-02",
  watching_status: "Completed",
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

// A member with a list of their own (self.list), so the tracker is drawn.
function mockFetch(entry = ENTRY) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => {
      const u = String(url);
      if (u.startsWith("/api/casting/anime-movie/")) return ok({ cast: [CAST_ROW] });
      if (u.startsWith("/api/anime-movie/")) return ok(entry);
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
          <MemoryRouter initialEntries={["/anime-movie/1"]}>
            <PageTitleProvider>
              <Routes>
                <Route path="/anime-movie/:publicId/:slug?" element={<AnimeMovie />} />
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

describe("AnimeMovie detail page - tab title and contents", () => {
  it("titles the tab with the entry's displayed title, the one the heading shows", async () => {
    mockFetch();
    mount();
    await screen.findByRole("heading", { level: 1, name: "測試動畫電影" });
    await waitFor(() => expect(document.title).toBe("測試動畫電影"));
  });

  it("lists the main-column sections in page order", async () => {
    mockFetch();
    mount();
    await screen.findByText("Protagonist");
    await waitFor(() =>
      expect(rows()).toEqual(["My tracker", "Naming", "Information", "Production", "Cast"]),
    );
  });
});

// No line of type, status, runtime and date above the title: the
// Information card says each of them. The breadcrumb stays.
describe("AnimeMovie detail page - header", () => {
  it("draws no eyebrow line above the title, and keeps the breadcrumb", async () => {
    mockFetch({ ...ENTRY, length_min: 95 });
    mount();
    const title = await screen.findByRole("heading", { level: 1, name: "測試動畫電影" });
    expect(title.previousElementSibling).toBeNull();
    expect(screen.queryByText(/·/)).toBeNull();
    const crumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumb).getByRole("link", { name: /anime movie/i })).toBeInTheDocument();
  });
});

describe("AnimeMovie detail page - release", () => {
  const information = async () =>
    within(await screen.findByRole("heading", { level: 3, name: "Information" }).then((h) => h.closest("section")));

  it("shows the release status and type, and a Cinema release's JP and TW dates", async () => {
    mockFetch();
    mount();
    const card = await information();
    expect(card.getByText("Release Status")).toBeInTheDocument();
    expect(card.getByText("Released")).toBeInTheDocument();
    expect(card.getByText("Release Type")).toBeInTheDocument();
    expect(card.getByText("Cinema")).toBeInTheDocument();
    expect(card.getByText("Release Date JP")).toBeInTheDocument();
    expect(card.getByText("Release Date TW")).toBeInTheDocument();
    expect(card.queryByText("Airing Status")).toBeNull();
  });

  it("shows an ONA's one Release Date in place of the JP and TW rows", async () => {
    mockFetch({ ...ENTRY, release_type: "ONA", release_date_jp: "2025-03-01", release_date_tw: "2025-03-01" });
    mount();
    const card = await information();
    expect(card.getByText("Release Date")).toBeInTheDocument();
    expect(card.getByText("2025-03-01")).toBeInTheDocument();
    expect(card.queryByText("Release Date JP")).toBeNull();
    expect(card.queryByText("Release Date TW")).toBeNull();
  });

  // Runtime sits right of Release Type, whatever the release type is.
  const infoLabels = async () => {
    const body = (await screen.findByRole("heading", { level: 3, name: "Information" }))
      .nextElementSibling;
    return [...body.children].map((row) =>
      [...row.querySelectorAll(".font-mono")].map((el) => el.textContent),
    );
  };

  it("puts Runtime right of Release Type on a Cinema release", async () => {
    mockFetch({ ...ENTRY, length_min: 95 });
    mount();
    const labels = await infoLabels();
    expect(labels.slice(0, 2)).toEqual([
      ["Release Status", "Release Type", "Runtime"],
      ["Release Date JP", "Release Date TW"],
    ]);
    expect(screen.getByText("1hr 35min")).toBeInTheDocument();
  });

  it("puts Runtime right of Release Type on an ONA", async () => {
    mockFetch({ ...ENTRY, release_type: "ONA", length_min: 95 });
    mount();
    const labels = await infoLabels();
    expect(labels.slice(0, 2)).toEqual([
      ["Release Status", "Release Type", "Runtime"],
      ["Release Date"],
    ]);
  });

  it("falls back to the TW date on an ONA with no JP one", async () => {
    mockFetch({ ...ENTRY, release_type: "ONA", release_date_jp: null, release_date_tw: "2025-04" });
    mount();
    const card = await information();
    expect(card.getByText("2025-04")).toBeInTheDocument();
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
