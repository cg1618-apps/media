// Franchise Modify tab: a franchise's favourite-grid slot is not edited here.
// Slots are set only in the Fav 3×3 tab; this form keeps only the per-type
// 3x3 cover, which is still chosen from the franchise's own entries.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";

import FranchiseModifyTab from "./FranchiseModifyTab";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => [] })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderForm(ff) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <FranchiseModifyTab
        ff={ff}
        uf={() => {}}
        allAnime={[]}
        allAnimeMovies={[]}
        allMovies={[]}
        allTvShows={[]}
        allCartoons={[]}
        allMangas={[]}
        allBooks={[]}
        allComics={[]}
        collectionItems={[]}
        editingItem={null}
      />
    </QueryClientProvider>,
  );
}

describe("FranchiseModifyTab favourite grid", () => {
  it("renders no slot field, even for a franchise that holds a slot", () => {
    renderForm({
      franchise_type: "Anime, Manga",
      type_slots: { Anime: 3, Manga: 1 },
    });

    expect(screen.queryByText(/Favorite Grid Slot/)).toBeNull();
    expect(screen.queryByText(/1–9 slot/)).toBeNull();
  });

  it("still offers the per-type 3x3 cover", () => {
    renderForm({ franchise_type: "Anime, Manga" });

    expect(screen.getByText("3x3 Cover — Anime")).toBeInTheDocument();
    expect(screen.getByText("3x3 Cover — Manga")).toBeInTheDocument();
  });
});
