// The picker page: its modes, the draw, and which lists it fetches.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { AuthProvider } from "../../contexts/AuthContext";
import { ToastProvider } from "../../hooks/useToast";
import RandomPicker from "./RandomPicker";

let visibleGatedTypes = [];
let storedDefaults = {};
let storedWeighted = {};
let username = null;
let permissions = [];

function respond(url) {
  if (url.startsWith("/api/auth/me")) {
    return {
      is_admin: false,
      username,
      role: "guest",
      permissions,
      visible_gated_types: visibleGatedTypes,
    };
  }
  if (url.startsWith("/api/anime/"))
    // A status and a rating on each, so a personal filter has something to
    // act on, and a MAL score either side of 8 for the external-score filter.
    return [
      {
        system_id: "a1",
        anime_name_en: "Frieren",
        airing_type: "TV",
        watching_status: "Completed",
        my_rating: "S",
        mal_rating: 9.3,
        genre_main: "Fantasy",
      },
      {
        system_id: "a2",
        anime_name_en: "Mushishi Special",
        airing_type: "Special",
        watching_status: "Plan to Watch",
        mal_rating: 7.6,
        watch_next: true,
      },
    ];
  if (url.startsWith("/api/random-picker-defaults/")) {
    const mode = url.split("/").pop();
    return {
      mode,
      version: 1,
      filters: storedDefaults[mode] ?? {},
      weighted: storedWeighted[mode] ?? true,
    };
  }
  if (url.startsWith("/api/manga/"))
    // Dated, so the release decade has a decade beside the undated anime.
    return [{ system_id: "m1", manga_name_en: "Yotsuba", franchise_id: "f2", release_date: "2003-03-21" }];
  if (url.startsWith("/api/franchise/"))
    return [
      { system_id: "f1", public_id: 1, franchise_name_en: "Steins Gate", franchise_type: "Anime" },
      { system_id: "f2", public_id: 2, franchise_name_en: "Yotsuba Franchise", franchise_type: "Manga" },
    ];
  return [];
}

beforeEach(() => {
  visibleGatedTypes = [];
  storedDefaults = {};
  storedWeighted = {};
  username = null;
  permissions = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(respond(String(url))) }))
  );
});
afterEach(() => vi.unstubAllGlobals());

function mount(path) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/random" element={<RandomPicker />} />
              <Route path="/random/:type" element={<RandomPicker />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

const fetched = () => fetch.mock.calls.map(([url]) => String(url));

// The two kinds of signed-in picker viewer: a shared account holds the
// picker and keeps no list; a member keeps one.
function signInShared() {
  username = "shared-reader";
  permissions = ["view.random_picker"];
}
function signInMember() {
  username = "reader";
  permissions = ["view.random_picker", "self.list"];
}

it("opens on the franchise mode, with no All mode", async () => {
  mount("/random");
  await waitFor(() => expect(screen.getByText("2 in the pool")).toBeInTheDocument());
  expect(screen.getByRole("link", { name: "Franchise" })).toHaveAttribute("aria-current", "page");
  expect(screen.queryByRole("link", { name: "All" })).not.toBeInTheDocument();
  const strip = screen.getByRole("navigation", { name: "Picker mode" });
  expect(within(strip).getAllByRole("link").map((a) => a.textContent)).toEqual([
    "Franchise",
    "Anime",
    "Anime Movie",
    "Movie",
    "TV Show",
    "Cartoon",
    "Manga",
    "Book",
    "Comic",
    "Game",
  ]);
});

it("shows the title alone, with no eyebrow or tagline", async () => {
  mount("/random/anime");
  await waitFor(() => expect(screen.getByText("2 in the pool")).toBeInTheDocument());
  expect(screen.queryByText("Track")).not.toBeInTheDocument();
  expect(screen.queryByText(/Narrow the pool with filters/)).not.toBeInTheDocument();
});

it("offers a type's own filters in its mode", async () => {
  mount("/random/anime");
  await waitFor(() => expect(screen.getByText("2 in the pool")).toBeInTheDocument());
  expect(screen.queryByText("Media Type")).not.toBeInTheDocument();
  expect(fetched().some((u) => u.startsWith("/api/manga/"))).toBe(false);

  fireEvent.click(screen.getByRole("button", { name: "Special" }));
  expect(screen.getByText("1 in the pool")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^pick$/i }));
  expect(await screen.findByText("Mushishi Special")).toBeInTheDocument();
});

it("empties the pool and disables the draw when nothing matches", async () => {
  mount("/random/anime");
  await waitFor(() => expect(screen.getByText("2 in the pool")).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "OVA" }));
  expect(screen.getByText("0 in the pool")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^pick$/i })).toBeDisabled();
});

// Both halves use the same page and mocks; only what /api/auth/me names
// differs, so the refusal is the gate's and not an empty mock.
it("fetches a gated type only for a session that may see it", async () => {
  mount("/random");
  await waitFor(() => expect(screen.getByText("2 in the pool")).toBeInTheDocument());
  expect(fetched().some((u) => u.startsWith("/api/hentai/"))).toBe(false);
  expect(screen.queryByRole("link", { name: "Hentai" })).not.toBeInTheDocument();
});

it("fetches and offers a gated type the session may see", async () => {
  visibleGatedTypes = ["hentai"];
  mount("/random");
  await waitFor(() => expect(fetched().some((u) => u.startsWith("/api/hentai/"))).toBe(true));
  expect(await screen.findByRole("link", { name: "Hentai" })).toBeInTheDocument();
});

it("draws a franchise in the franchise mode, unweighted, narrowed by its type", async () => {
  mount("/random/franchise");
  await waitFor(() => expect(screen.getByText("2 in the pool")).toBeInTheDocument());
  expect(screen.queryByLabelText("Weighted")).not.toBeInTheDocument();
  expect(screen.queryByText("Holds a")).not.toBeInTheDocument();
  expect(screen.queryByText("Holds an Entry That Is")).not.toBeInTheDocument();

  // The chip, not the mode link of the same name.
  fireEvent.click(screen.getByRole("button", { name: "Manga" }));
  expect(screen.getByText("1 in the pool")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^pick$/i }));
  expect(await screen.findByText("Yotsuba Franchise")).toBeInTheDocument();
  expect(screen.getByText("1 in 1 (100.0%) chance")).toBeInTheDocument();
});

it("sends an unknown type back to the franchise mode", async () => {
  mount("/random/hologram");
  await waitFor(() => expect(screen.getByText("2 in the pool")).toBeInTheDocument());
  expect(screen.getByRole("link", { name: "Franchise" })).toHaveAttribute("aria-current", "page");
});

it("clears every filter and the pick with the panel's Clear all", async () => {
  mount("/random/anime");
  await waitFor(() => expect(screen.getByText("2 in the pool")).toBeInTheDocument());
  expect(screen.queryByRole("button", { name: "Clear all" })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Special" }));
  fireEvent.click(screen.getByRole("button", { name: /^pick$/i }));
  expect(await screen.findByText("Mushishi Special")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
  expect(screen.getByText("2 in the pool")).toBeInTheDocument();
  expect(screen.queryByText("Mushishi Special")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Special" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.queryByRole("button", { name: "Clear all" })).not.toBeInTheDocument();
});

it("opens a mode on its saved defaults, and Reset to Default brings them back", async () => {
  storedDefaults = { anime: { airingType: ["Special"] } };
  mount("/random/anime");
  await waitFor(() => expect(screen.getByText("1 in the pool")).toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Special" })).toHaveAttribute("aria-pressed", "true");

  fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
  expect(screen.getByText("2 in the pool")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Reset to Default" }));
  expect(screen.getByText("1 in the pool")).toBeInTheDocument();
});

it("offers no Reset to Default for a mode with none saved", async () => {
  mount("/random/anime");
  await waitFor(() => expect(screen.getByText("2 in the pool")).toBeInTheDocument());
  expect(screen.queryByRole("button", { name: "Reset to Default" })).not.toBeInTheDocument();
});

it("draws weighted by default, and says the chance the pick had", async () => {
  signInMember();
  mount("/random/anime");
  await waitFor(() => expect(screen.getByText("2 in the pool")).toBeInTheDocument());
  expect(screen.getByRole("checkbox", { name: "Weighted" })).toBeChecked();

  fireEvent.click(screen.getByRole("button", { name: "Special" }));
  fireEvent.click(screen.getByRole("button", { name: /^pick$/i }));
  expect(await screen.findByText(/1 in 1 \(100\.0%\) chance/)).toBeInTheDocument();
});

it("opens a mode saved unweighted as unweighted, and Reset to Default brings that back", async () => {
  signInMember();
  storedWeighted = { anime: false };
  mount("/random/anime");
  await waitFor(() => expect(screen.getByText("2 in the pool")).toBeInTheDocument());
  const weighted = screen.getByRole("checkbox", { name: "Weighted" });
  expect(weighted).not.toBeChecked();

  fireEvent.click(weighted);
  expect(weighted).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Reset to Default" }));
  expect(weighted).not.toBeChecked();
});

// Same page and mocks both times; only the session differs, so the guest's
// missing request is the page's choice and not a mock that never answers.
it("asks a guest for no plan marks, since a plan is private", async () => {
  mount("/random/anime");
  await waitFor(() => expect(screen.getByText("2 in the pool")).toBeInTheDocument());
  expect(fetched().some((u) => u.startsWith("/api/plan-next"))).toBe(false);
});

// The two versions of the page. Each pair is the same page, mocks and data
// - entries with a status, a rating and a plan mark to filter on - with only
// the session differing, so an absence is the list gate's doing.
it("without a list, offers only the catalogue filters, no weighting and asks for no plan marks", async () => {
  signInShared();
  mount("/random/anime");
  await waitFor(() => expect(screen.getByText("2 in the pool")).toBeInTheDocument());
  expect(screen.getByRole("navigation", { name: "Picker mode" })).toBeInTheDocument();
  for (const kept of ["Airing Type", "Release Decade", "MAL Score", "Genre Main"]) {
    expect(screen.getByText(kept)).toBeInTheDocument();
  }
  for (const gone of ["Watch Status", "My Rating", "Do Next", "Redo"]) {
    expect(screen.queryByText(gone)).not.toBeInTheDocument();
  }
  expect(screen.queryByRole("checkbox", { name: "Weighted" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Weights" })).not.toBeInTheDocument();
  expect(fetched().some((u) => u.startsWith("/api/plan-next"))).toBe(false);
});

it("with a list, offers the personal filters and weighting, and asks for plan marks", async () => {
  signInMember();
  mount("/random/anime");
  await waitFor(() => expect(screen.getByText("2 in the pool")).toBeInTheDocument());
  for (const kept of ["Watch Status", "My Rating", "Do Next", "Redo"]) {
    expect(screen.getByText(kept)).toBeInTheDocument();
  }
  expect(screen.getByRole("checkbox", { name: "Weighted" })).toBeChecked();
  expect(screen.getByRole("button", { name: "Weights" })).toBeInTheDocument();
  await waitFor(() =>
    expect(fetched().some((u) => u.startsWith("/api/plan-next"))).toBe(true),
  );
});

// A shared account has every mode a member has; only the personal filters go.
it("gives a shared account every mode, the franchise one without its personal filters", async () => {
  signInShared();
  mount("/random/franchise");
  await waitFor(() => expect(screen.getByText("2 in the pool")).toBeInTheDocument());
  expect(screen.getByRole("link", { name: "Anime" })).toBeInTheDocument();
  expect(screen.getByText("Franchise Type")).toBeInTheDocument();
  expect(screen.queryByText("Expectation")).not.toBeInTheDocument();
  expect(screen.queryByText("My Rating")).not.toBeInTheDocument();
});

it("with a list, offers the franchise mode's personal filters", async () => {
  signInMember();
  mount("/random/franchise");
  await waitFor(() => expect(screen.getByText("2 in the pool")).toBeInTheDocument());
  expect(screen.getByText("Expectation")).toBeInTheDocument();
  expect(screen.getByText("My Rating")).toBeInTheDocument();
});

it("narrows by a Do next mark on the entry", async () => {
  signInMember();
  mount("/random/anime");
  await waitFor(() => expect(screen.getByText("2 in the pool")).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Do next" }));
  expect(screen.getByText("1 in the pool")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^pick$/i }));
  expect(await screen.findByText("Mushishi Special")).toBeInTheDocument();
});

it("without a list, ignores a saved personal default and draws evenly", async () => {
  signInShared();
  storedDefaults = { anime: { watchingStatus: ["Completed"] } };
  mount("/random/anime");
  await waitFor(() => expect(screen.getByText("2 in the pool")).toBeInTheDocument());
  expect(screen.queryByRole("button", { name: "Reset to Default" })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /^pick$/i }));
  expect(await screen.findByText("1 in 2 (50.0%) chance")).toBeInTheDocument();
});

it("with a list, opens on the same saved personal default", async () => {
  signInMember();
  storedDefaults = { anime: { watchingStatus: ["Completed"] } };
  mount("/random/anime");
  await waitFor(() => expect(screen.getByText("1 in the pool")).toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Reset to Default" })).toBeInTheDocument();
});

it("without a list, opens the picker for a Weights tab link", async () => {
  signInShared();
  mount("/random?tab=weights");
  await waitFor(() => expect(screen.getByText("2 in the pool")).toBeInTheDocument());
  expect(screen.queryByText("Step 1 · Status group")).not.toBeInTheDocument();
});

// A catalogue filter, so a session without a list has it too.
it.each([
  ["without a list", () => {}],
  ["with a list", signInMember],
])("narrows the pool by external score %s", async (_label, signIn) => {
  signIn();
  mount("/random/anime");
  await waitFor(() => expect(screen.getByText("2 in the pool")).toBeInTheDocument());
  const mal = screen.getByText("MAL Score").parentElement;

  fireEvent.click(within(mal).getByRole("button", { name: "8+" }));
  expect(screen.getByText("1 in the pool")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^pick$/i }));
  expect(await screen.findByText("Frieren")).toBeInTheDocument();
  expect(screen.queryByText("Mushishi Special")).not.toBeInTheDocument();
});

it("lists every weight on the Weights tab", async () => {
  signInMember();
  mount("/random?tab=weights");
  expect(await screen.findByText("Step 1 · Status group")).toBeInTheDocument();
  expect(screen.getByText("Stopped")).toBeInTheDocument();
  expect(screen.getByText("Serialization · Manga")).toBeInTheDocument();
  expect(screen.queryByText(/in the pool/)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Picker" }));
  await waitFor(() => expect(screen.getByText("2 in the pool")).toBeInTheDocument());
});
