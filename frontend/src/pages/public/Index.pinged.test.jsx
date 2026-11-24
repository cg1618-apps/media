// The dashboard's Pinged division: the viewer's pinned entries, above
// Watching, grouped into one soft section per tracker division. The fixture
// pins one entry in each division and leaves a second watching entry
// unpinned, so a pass means the pin did the choosing - with every entry
// pinned, "only pinned entries are drawn" would hold by accident.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { AuthProvider } from "../../contexts/AuthContext";
import { ToastProvider } from "../../hooks/useToast";
import Index from "./Index";

let pins;

function respond(url) {
  if (url.startsWith("/api/auth/me")) {
    return { is_admin: false, username: "reader", role: "user", permissions: ["self.list"] };
  }
  if (url.startsWith("/api/anime/"))
    return [
      {
        system_id: "a1",
        public_id: 101,
        anime_name_en: "Frieren",
        watching_status: "Active Watching",
        ep_fin: 3,
        ep_total: 28,
        is_pinged: pins.anime,
      },
      {
        system_id: "a2",
        public_id: 102,
        anime_name_en: "Mushishi",
        watching_status: "Active Watching",
        ep_fin: 1,
        ep_total: 26,
        is_pinged: false,
      },
    ];
  if (url.startsWith("/api/manga/"))
    return [
      {
        system_id: "m1",
        public_id: 202,
        manga_name_en: "Berserk",
        reading_status: "Passive Reading",
        ch_fin: 97,
        ch_total: 364,
        is_pinged: pins.manga,
      },
    ];
  if (url.startsWith("/api/game/"))
    return [
      {
        system_id: "g1",
        public_id: 303,
        game_name_en: "Outer Wilds",
        playing_status: "Play Anytime",
        is_pinged: pins.game,
      },
    ];
  return [];
}

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  pins = { anime: true, manga: true, game: true };
  localStorage.clear();
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.stubGlobal(
    "fetch",
    vi.fn((url) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(respond(String(url))),
      }),
    ),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter>
            <Index />
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

async function pinged() {
  await waitFor(() => expect(document.getElementById("pinged")).not.toBeNull());
  return document.getElementById("pinged");
}

it("draws Pinged above Watching", async () => {
  mount();
  const division = await pinged();
  const watching = document.getElementById("watching");
  expect(
    division.compareDocumentPosition(watching) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(within(division).getByRole("heading", { name: "Pinged" })).toBeInTheDocument();
  expect(within(division).getByText("3 pinned")).toBeInTheDocument();
});

it("groups the pins into a soft section per division, and only the pins", async () => {
  mount();
  const division = within(await pinged());
  expect(within(screen.getByTestId("pinged-watching")).getByText("Frieren")).toBeInTheDocument();
  expect(within(screen.getByTestId("pinged-reading")).getByText("Berserk")).toBeInTheDocument();
  expect(within(screen.getByTestId("pinged-playing")).getByText("Outer Wilds")).toBeInTheDocument();
  expect(division.getByRole("heading", { name: "Watching · 1" })).toBeInTheDocument();
  // Unpinned, and still in its own division.
  expect(division.queryByText("Mushishi")).toBeNull();
  expect(within(document.getElementById("watching")).getByText("Mushishi")).toBeInTheDocument();
  // A pinned entry stays in its division as well.
  expect(within(document.getElementById("watching")).getByText("Frieren")).toBeInTheDocument();
});

it("draws no soft section that holds no pin", async () => {
  pins = { anime: true, manga: false, game: false };
  mount();
  await pinged();
  expect(screen.getByTestId("pinged-watching")).toBeInTheDocument();
  expect(screen.queryByTestId("pinged-reading")).toBeNull();
  expect(screen.queryByTestId("pinged-playing")).toBeNull();
});

it("says so when nothing is pinned", async () => {
  pins = { anime: false, manga: false, game: false };
  mount();
  const division = within(await pinged());
  expect(division.getByText("0 pinned")).toBeInTheDocument();
  expect(division.getByText(/Nothing pinned/)).toBeInTheDocument();
});

it("lists Pinged in the contents, and not its soft sections", async () => {
  mount();
  await pinged();
  const toc = within(screen.getByRole("navigation", { name: "Contents" }));
  const rows = toc.getAllByRole("button").map((b) => b.textContent);
  expect(rows).toContain("Pinged");
  expect(rows.indexOf("Pinged")).toBeLessThan(rows.indexOf("Watching"));
  // The soft sections share their division's names; the contents' only
  // "Watching" row is the division's own.
  expect(rows.filter((r) => r === "Watching")).toHaveLength(1);
  expect(rows.filter((r) => r === "Reading")).toHaveLength(1);
});

it("follows the type filter", async () => {
  const user = userEvent.setup();
  mount();
  await pinged();
  await user.click(within(screen.getByTestId("dashboard-filter")).getByRole("button", { name: "Manga" }));
  const division = within(document.getElementById("pinged"));
  expect(division.getByText("Berserk")).toBeInTheDocument();
  expect(division.queryByText("Frieren")).toBeNull();
});
