// Frontend: the h-comic detail page, JP against KR.
//
// One page, two variants keyed on `region` (lib/hComicRegion.js): a JP entry
// counts pages and carries no highlights; a KR one counts chapters, says how
// far it trails the official source, and draws 亮點 Highlights - whose
// registry entry is KR-only (`owner_where`), so the page must not draw the
// card on a JP entry even though /api/notes/sections lists it for the type.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../../contexts/AuthContext";
import { ToastProvider } from "../../hooks/useToast";
import HComic from "./HComic";

const HIGHLIGHTS = {
  key: "h_comic_highlights",
  shape: "structured",
  label: "亮點 Highlights",
  require_any: [],
  hierarchical: false,
  group_by: "female_characters",
  owner_where: { region: ["KR"] },
  fields: [
    {
      key: "female_characters",
      label: "Female Characters",
      type: "names",
      column: null,
      required: true,
      options: [],
    },
    { key: "chapter", label: "Chapter", type: "text", column: "locator", options: [] },
  ],
};

const REMARK = { key: "remark", shape: "text", label: "Remark", owner_where: {} };

// A highlight row. The notes API would never return one for a JP entry (the
// server refuses the write), so handing it to the JP page as well proves the
// page itself drops the section rather than merely having nothing to show.
const HIGHLIGHT_ROW = {
  system_id: "n1",
  section: "h_comic_highlights",
  locator: "1-5",
  fields: { female_characters: ["Ahri"] },
};

function mockFetch(entry, notes = [], relations = []) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => {
      const u = String(url);
      let body = [];
      if (u.startsWith("/api/auth/me")) {
        body = {
          is_admin: false,
          username: "cg1618",
          role: "user",
          is_root: false,
          permissions: [],
          visible_gated_types: ["h-comic"],
        };
      } else if (u.startsWith(`/api/h-comic/${entry.system_id}`)) {
        body = entry;
      } else if (u.startsWith("/api/notes/sections")) {
        body = [REMARK, HIGHLIGHTS];
      } else if (u.startsWith("/api/notes")) {
        body = notes;
      } else if (u.startsWith("/api/casting/")) {
        body = { cast: [] };
      } else if (u.startsWith("/api/media-relation/for-entry")) {
        body = relations;
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    })
  );
}

afterEach(() => vi.unstubAllGlobals());

function mount(entry) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[`/h-comic/${entry.system_id}`]}>
            <Routes>
              <Route path="/h-comic/:publicId/:slug?" element={<HComic />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

const BASE = {
  franchise_id: null,
  series_id: null,
  cover_image_file: null,
  sources: [],
  content_labels: [],
  credit_refs: {},
};

describe("HComic detail page", () => {
  it("counts pages on a JP entry and draws no highlights", async () => {
    mockFetch(
      {
        ...BASE,
        system_id: "jp1",
        region: "JP",
        h_comic_name_en: "Jay Pee",
        page_fin: 4,
        page_total: 20,
        originality: "同人",
      },
      [HIGHLIGHT_ROW]
    );
    mount({ system_id: "jp1" });
    await screen.findByRole("heading", { name: "Jay Pee" });
    expect(screen.getByRole("spinbutton", { name: "Pages read" })).toHaveValue(4);
    expect(screen.getByText("Originality")).toBeInTheDocument();
    expect(screen.queryByText(/Behind official/)).toBeNull();
    // The notes page renders; the Highlights section and its row do not.
    await screen.findByText("Notes");
    expect(screen.queryByText("亮點 Highlights")).toBeNull();
    expect(screen.queryByText("Ahri")).toBeNull();
  });

  it("counts chapters on a KR entry, says how far behind, and draws highlights", async () => {
    mockFetch(
      {
        ...BASE,
        system_id: "kr1",
        region: "KR",
        h_comic_name_en: "Kay Are",
        ch_fin: 7,
        ch_total: 30,
        ch_behind: 3,
        highlight_group_order: [],
      },
      [HIGHLIGHT_ROW]
    );
    mount({ system_id: "kr1" });
    await screen.findByRole("heading", { name: "Kay Are" });
    expect(screen.getByRole("spinbutton", { name: "Chapters read" })).toHaveValue(7);
    expect(screen.getByText(/Behind official/)).toHaveTextContent("3");
    expect(screen.queryByText("Originality")).toBeNull();
    expect(await screen.findByText("亮點 Highlights")).toBeInTheDocument();
    // Grouped by female character.
    expect(screen.getByRole("heading", { name: "Ahri" })).toBeInTheDocument();
  });
});

// An adaptation relation from a hentai, as the relation card receives it on
// the h-comic's side: the stored row runs hentai -> h-comic, so it is reverse.
const ADAPTED_BY = {
  system_id: "r1",
  relation_type: "adaptation",
  label: "Adaptation",
  family: "derivation",
  direction: "reverse",
  derived: false,
  other: {
    media_type: "hentai",
    entry_id: "ht1",
    missing: false,
    display_name: "The Anime",
    label: "Hentai",
    nav_path: "/hentai/5/the-anime",
  },
};

describe("HComic animation status", () => {
  const JP = {
    ...BASE,
    system_id: "jp2",
    region: "JP",
    h_comic_name_en: "Jay Pee Two",
    page_fin: 0,
    page_total: 10,
  };

  it("names the hentai a derived status comes from, linked", async () => {
    mockFetch(
      { ...JP, animation_status: "Animated", animation_status_source: "derived" },
      [],
      [ADAPTED_BY]
    );
    mount({ system_id: "jp2" });
    await screen.findByRole("heading", { name: "Jay Pee Two" });
    // Named inside the note itself, not only on the relation card beside it.
    const note = await screen.findByText(/Derived from/);
    expect(await within(note).findByRole("link", { name: "The Anime" })).toHaveAttribute(
      "href",
      "/hentai/5/the-anime"
    );
  });

  it("shows a hand-set status plainly, with the same relation row present", async () => {
    // The mirror case: the relation is there, so a missing note proves the
    // page read the source rather than the relation.
    mockFetch(
      { ...JP, animation_status: "Announced", animation_status_source: "manual" },
      [],
      [ADAPTED_BY]
    );
    mount({ system_id: "jp2" });
    await screen.findByRole("heading", { name: "Jay Pee Two" });
    expect(screen.getByText("Announced")).toBeInTheDocument();
    await screen.findAllByRole("link", { name: /The Anime/ });
    expect(screen.queryByText(/Derived from/)).toBeNull();
  });

  it("links the MAL entry in the Sources card", async () => {
    mockFetch({
      ...BASE,
      system_id: "mal1",
      region: "KR",
      h_comic_name_en: "Em Ay El",
      mal_id: 777,
      mal_link: "https://myanimelist.net/manga/777",
    });
    mount({ system_id: "mal1" });
    await screen.findByRole("heading", { name: "Em Ay El" });
    const link = screen
      .getAllByRole("link")
      .find((a) => a.getAttribute("href") === "https://myanimelist.net/manga/777");
    expect(link).toBeTruthy();
  });
});
