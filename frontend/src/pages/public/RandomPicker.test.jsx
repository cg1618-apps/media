// The picker page: its modes, the draw, and which lists it fetches.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
      },
      {
        system_id: "a2",
        anime_name_en: "Mushishi Special",
        airing_type: "Special",
        watching_status: "Plan to Watch",
        mal_rating: 7.6,
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
      { system_id: "f1", public_id: 1, franchise_name_en: "Steins Gate", franchise_type: "ACG" },
      { system_id: "f2", public_id: 2, franchise_name_en: "Yotsuba Franchise", franchise_type: "ACG" },
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

it("draws across types in the general mode, narrowed by media type", async () => {
  mount("/random");
  await waitFor(() => expect(screen.getByText("3 in the pool")).toBeInTheDocument());

  // The chip, not the mode link of the same name.
  fireEvent.click(screen.getByRole("button", { name: "Manga" }));
  expect(screen.getByText("1 in the pool")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /^pick$/i }));
  expect(await screen.findByText("Yotsuba")).toBeInTheDocument();
  expect(screen.queryByText("Frieren")).not.toBeInTheDocument();
});

it("offers a type's own library filters in its mode", async () => {
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
  await waitFor(() => expect(screen.getByText("3 in the pool")).toBeInTheDocument());
  expect(fetched().some((u) => u.startsWith("/api/hentai/"))).toBe(false);
  expect(screen.queryByRole("link", { name: "Hentai" })).not.toBeInTheDocument();
});

it("fetches and offers a gated type the session may see", async () => {
  visibleGatedTypes = ["hentai"];
  mount("/random");
  await waitFor(() => expect(fetched().some((u) => u.startsWith("/api/hentai/"))).toBe(true));
  expect(await screen.findByRole("link", { name: "Hentai" })).toBeInTheDocument();
});

it("draws a franchise in the franchise mode, unweighted, narrowed by what it holds", async () => {
  mount("/random/franchise");
  await waitFor(() => expect(screen.getByText("2 in the pool")).toBeInTheDocument());
  expect(screen.getByRole("link", { name: "Franchise" })).toHaveAttribute("aria-current", "page");
  expect(screen.queryByLabelText("Weighted")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Manga" }));
  expect(screen.getByText("1 in the pool")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^pick$/i }));
  expect(await screen.findByText("Yotsuba Franchise")).toBeInTheDocument();
  expect(screen.getByText("1 in 1 (100.0%) chance")).toBeInTheDocument();
});

it("sends an unknown type back to the general mode", async () => {
  mount("/random/hologram");
  await waitFor(() => expect(screen.getByText("3 in the pool")).toBeInTheDocument());
  expect(screen.getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "page");
});

it("clears every filter and the pick with Clear all", async () => {
  mount("/random/anime");
  await waitFor(() => expect(screen.getByText("2 in the pool")).toBeInTheDocument());
  const clear = screen.getByRole("button", { name: "Clear all" });
  expect(clear).toBeDisabled();

  fireEvent.click(screen.getByRole("button", { name: "Special" }));
  fireEvent.click(screen.getByRole("button", { name: /^pick$/i }));
  expect(await screen.findByText("Mushishi Special")).toBeInTheDocument();

  fireEvent.click(clear);
  expect(screen.getByText("2 in the pool")).toBeInTheDocument();
  expect(screen.queryByText("Mushishi Special")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Special" })).toHaveAttribute("aria-pressed", "false");
  expect(clear).toBeDisabled();
});

it("opens a mode on its saved defaults, and Defaults brings them back", async () => {
  storedDefaults = { anime: { airingType: ["Special"] } };
  mount("/random/anime");
  await waitFor(() => expect(screen.getByText("1 in the pool")).toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Special" })).toHaveAttribute("aria-pressed", "true");

  fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
  expect(screen.getByText("2 in the pool")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Defaults" }));
  expect(screen.getByText("1 in the pool")).toBeInTheDocument();
});

it("offers no Defaults button for a mode with none saved", async () => {
  mount("/random/anime");
  await waitFor(() => expect(screen.getByText("2 in the pool")).toBeInTheDocument());
  expect(screen.queryByRole("button", { name: "Defaults" })).not.toBeInTheDocument();
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

it("opens a mode saved unweighted as unweighted, and Defaults brings that back", async () => {
  signInMember();
  storedWeighted = { anime: false };
  mount("/random/anime");
  await waitFor(() => expect(screen.getByText("2 in the pool")).toBeInTheDocument());
  const weighted = screen.getByRole("checkbox", { name: "Weighted" });
  expect(weighted).not.toBeChecked();

  fireEvent.click(weighted);
  expect(weighted).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Defaults" }));
  expect(weighted).not.toBeChecked();
});

// Same page and mocks both times; only the session differs, so the guest's
// missing request is the page's choice and not a mock that never answers.
it("asks a guest for no plan marks, since a plan is private", async () => {
  mount("/random");
  await waitFor(() => expect(screen.getByText("3 in the pool")).toBeInTheDocument());
  expect(fetched().some((u) => u.startsWith("/api/plan-next"))).toBe(false);
});

// The two versions of the page. Each pair is the same page, mocks and data
// - entries with a status and a rating to filter on - with only the session
// differing, so an absence is the list gate's doing.
it("without a list, offers no personal filter, no weighting and asks for no plan marks", async () => {
  signInShared();
  mount("/random");
  await waitFor(() => expect(screen.getByText("3 in the pool")).toBeInTheDocument());
  expect(screen.getByText("Media Type")).toBeInTheDocument();
  expect(screen.queryByText("Status")).not.toBeInTheDocument();
  expect(screen.queryByText("My Rating")).not.toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: "Weighted" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Weights" })).not.toBeInTheDocument();
  expect(fetched().some((u) => u.startsWith("/api/plan-next"))).toBe(false);
});

it("with a list, offers the personal filters and weighting, and asks for plan marks", async () => {
  signInMember();
  mount("/random");
  await waitFor(() => expect(screen.getByText("3 in the pool")).toBeInTheDocument());
  expect(screen.getByText("Status")).toBeInTheDocument();
  expect(screen.getByText("My Rating")).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "Weighted" })).toBeChecked();
  expect(screen.getByRole("button", { name: "Weights" })).toBeInTheDocument();
  await waitFor(() =>
    expect(fetched().some((u) => u.startsWith("/api/plan-next"))).toBe(true),
  );
});

// A shared account's picker is the one over every entry, with two filters.
// The member mirror below runs the same page and mocks.
it("gives a shared account one picker with only media type and release decade", async () => {
  signInShared();
  mount("/random");
  await waitFor(() => expect(screen.getByText("3 in the pool")).toBeInTheDocument());
  expect(screen.queryByRole("navigation", { name: "Picker mode" })).not.toBeInTheDocument();
  expect(screen.getByText("Media Type")).toBeInTheDocument();
  expect(screen.getByText("Release Decade")).toBeInTheDocument();
  for (const gone of ["Genre", "MAL Score", "External Score", "Status", "My Rating"]) {
    expect(screen.queryByText(gone)).not.toBeInTheDocument();
  }

  // The decades are the ones the pool holds: the manga's, and Unknown for
  // the undated anime.
  fireEvent.click(screen.getByRole("button", { name: "2000s" }));
  expect(screen.getByText("1 in the pool")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "2010s" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^pick$/i }));
  expect(await screen.findByText("Yotsuba")).toBeInTheDocument();
});

it.each(["/random/anime", "/random/franchise"])(
  "sends a shared account from %s to the one picker",
  async (path) => {
    signInShared();
    mount(path);
    await waitFor(() => expect(screen.getByText("3 in the pool")).toBeInTheDocument());
    expect(screen.queryByRole("navigation", { name: "Picker mode" })).not.toBeInTheDocument();
    expect(screen.queryByText("Airing Type")).not.toBeInTheDocument();
    expect(fetched().some((u) => u.startsWith("/api/franchise/"))).toBe(false);
  },
);

it("keeps every mode and the full filters for a member", async () => {
  signInMember();
  mount("/random");
  await waitFor(() => expect(screen.getByText("3 in the pool")).toBeInTheDocument());
  const strip = screen.getByRole("navigation", { name: "Picker mode" });
  expect(strip).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Franchise" })).toBeInTheDocument();
  expect(screen.getByText("Release Decade")).toBeInTheDocument();
  expect(screen.getByText("External Score")).toBeInTheDocument();
  expect(screen.getByText("Status")).toBeInTheDocument();
});

it("with a list, offers a type's own status filter", async () => {
  signInMember();
  mount("/random/anime");
  await waitFor(() => expect(screen.getByText("2 in the pool")).toBeInTheDocument());
  expect(screen.getByText("Watch Status")).toBeInTheDocument();
});

it("without a list, ignores a saved personal default and draws evenly", async () => {
  signInShared();
  storedDefaults = { all: { statusGroup: ["Completed"] } };
  mount("/random");
  await waitFor(() => expect(screen.getByText("3 in the pool")).toBeInTheDocument());
  expect(screen.queryByRole("button", { name: "Defaults" })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Anime" }));
  fireEvent.click(screen.getByRole("button", { name: /^pick$/i }));
  expect(await screen.findByText("1 in 2 (50.0%) chance")).toBeInTheDocument();
});

it("with a list, opens on the same saved personal default", async () => {
  signInMember();
  storedDefaults = { all: { statusGroup: ["Completed"] } };
  mount("/random");
  await waitFor(() => expect(screen.getByText("1 in the pool")).toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Defaults" })).toBeInTheDocument();
});

it("without a list, opens the picker for a Weights tab link", async () => {
  signInShared();
  mount("/random?tab=weights");
  await waitFor(() => expect(screen.getByText("3 in the pool")).toBeInTheDocument());
  expect(screen.queryByText("Step 1 · Status group")).not.toBeInTheDocument();
});

// A catalogue filter, so a guest-like session without a list has it too; a
// shared account does not, having only the one picker.
it.each([
  ["without a list", () => {}],
  ["with a list", signInMember],
])("narrows the pool by external score %s", async (_label, signIn) => {
  signIn();
  mount("/random/anime");
  await waitFor(() => expect(screen.getByText("2 in the pool")).toBeInTheDocument());
  expect(screen.getByText("MAL Score")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "8+" }));
  expect(screen.getByText("1 in the pool")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^pick$/i }));
  expect(await screen.findByText("Frieren")).toBeInTheDocument();
  expect(screen.queryByText("Mushishi Special")).not.toBeInTheDocument();
});

it("lists every weight on the Weights tab", async () => {
  signInMember();
  mount("/random?tab=weights");
  expect(await screen.findByText("Step 1 · Status group")).toBeInTheDocument();
  expect(screen.getByText("Serialization · Manga mode only")).toBeInTheDocument();
  expect(screen.queryByText(/in the pool/)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Picker" }));
  await waitFor(() => expect(screen.getByText("3 in the pool")).toBeInTheDocument());
});
