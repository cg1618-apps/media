// Frontend: the h-game detail page.
//
// What it has that Game's page does not: the multi-choice facts (null is "not
// recorded", [] is "none of these"), the DLsite links beside Steam under
// Where to Play, and 亮點 Highlights, whose group order is the entry's own
// highlight_group_order - moved on the page and saved whole by PATCH, the way
// h-comic's is.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../../contexts/AuthContext";
import { ToastProvider } from "../../hooks/useToast";
import HGame, { choiceText } from "./HGame";

// The registry entry as GET /api/notes/sections serves it for an h-game: no
// owner_where, since every h-game takes it.
const HIGHLIGHTS = {
  key: "h_game_highlights",
  shape: "structured",
  label: "亮點 Highlights",
  require_any: [],
  hierarchical: false,
  group_by: "female_characters",
  owner_where: {},
  fields: [
    {
      key: "female_characters",
      label: "Female Characters",
      type: "names",
      column: null,
      required: true,
      options: [],
    },
    { key: "route_scene", label: "Route / Scene", type: "text", column: "locator", options: [] },
  ],
};

const note = (id, female) => ({
  system_id: id,
  section: "h_game_highlights",
  locator: null,
  content: null,
  kind: null,
  status: null,
  fields: { female_characters: female },
});

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
  copies: [],
  steam_link: "https://store.steampowered.com/app/1/",
  dlsite_link_jp: "https://www.dlsite.com/maniax/work/=/product_id/RJ1.html",
  dlsite_link_tw: null,
  audio_availability: [],
  h_presentation: null,
  art_style: ["2D", "Live2D"],
  platform: ["Steam", "DLsite"],
  highlight_group_order: ["Ahri", "Bora"],
};

function mockFetch(entry, notes) {
  const fetchMock = vi.fn((url, options = {}) => {
    const u = String(url);
    let body = [];
    if (u.startsWith("/api/auth/me")) {
      body = {
        is_admin: true,
        username: "cg1618",
        role: "admin",
        is_root: false,
        permissions: ["manage.catalog", "self.list"],
        visible_gated_types: ["h-comic", "h-game"],
      };
    } else if (u.startsWith(`/api/h-game/${entry.system_id}`)) {
      body =
        options.method === "PATCH" ? { ...entry, ...JSON.parse(options.body) } : entry;
    } else if (u.startsWith("/api/notes/sections")) {
      body = [HIGHLIGHTS];
    } else if (u.startsWith("/api/notes")) {
      body = notes;
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={["/h-game/hg1"]}>
            <Routes>
              <Route path="/h-game/:publicId/:slug?" element={<HGame />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

describe("choiceText", () => {
  it("keeps not-recorded and none-of-these apart", () => {
    expect(choiceText(null)).toBeNull();
    expect(choiceText(undefined)).toBeNull();
    expect(choiceText([])).toBe("None");
    expect(choiceText(["一般對話", "H場景"])).toBe("一般對話 · H場景");
  });
});

describe("HGame detail page", () => {
  it("lists the DLsite link beside Steam under Where to Play", async () => {
    mockFetch(ENTRY, []);
    mount();
    await screen.findByRole("heading", { name: "Aitch Game" });
    const play = screen.getByRole("region", { name: "Where to Play" });
    expect(within(play).getByRole("link", { name: /Steam store page/ })).toHaveAttribute(
      "href",
      ENTRY.steam_link
    );
    expect(within(play).getByRole("link", { name: /DLsite \(JP\)/ })).toHaveAttribute(
      "href",
      ENTRY.dlsite_link_jp
    );
    // No TW link recorded, so no TW row.
    expect(within(play).queryByRole("link", { name: /DLsite \(TW\)/ })).toBeNull();
  });

  it("orders highlight groups by the entry and saves a move whole", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(ENTRY, [note("n1", ["Bora"]), note("n2", ["Ahri"])]);
    mount();
    expect(await screen.findByText("亮點 Highlights")).toBeInTheDocument();
    // Bora's row came first, but the stored order puts Ahri first.
    const names = () =>
      screen
        .getAllByTestId("group-header")
        .map((h) => within(h).getByRole("heading").textContent);
    expect(names()).toEqual(["Ahri", "Bora"]);

    await user.click(screen.getByRole("button", { name: "Move group Bora up" }));

    const patch = fetchMock.mock.calls.find(
      ([url, options]) => String(url) === "/api/h-game/hg1" && options?.method === "PATCH"
    );
    expect(patch).toBeDefined();
    expect(JSON.parse(patch[1].body)).toEqual({ highlight_group_order: ["Bora", "Ahri"] });
  });
});
