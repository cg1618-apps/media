// The universal search dropdown: the label each row carries, how many rows a
// query gets, the colour of each row's type badge, and when the dropdown
// closes.
//
// The dropdown once carried its own per-type fallback chain, and `game` was
// never added to it, so every game result rendered as a dash. The
// getResultName tests pin the row label to the app-wide chain in
// lib/naming.js.
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import NavSearch, {
  getResultName,
  MAX_RESULTS,
  mergeBuckets,
  RESULT_TYPES,
} from "./NavSearch";
import { typeHue } from "../../config/scopeColors";

// The viewer each test renders as. `has` answers from a plain set, and the
// default holds every key a scope or a row link can ask, so a test that
// takes one away is the only thing that differs from its mirror.
const auth = vi.hoisted(() => ({ value: null }));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => auth.value,
}));

const EVERY_KEY = [
  ...[
    "anime",
    "anime-movie",
    "movie",
    "tv-show",
    "cartoon",
    "manga",
    "novel",
    "comic",
    "game",
    "h-comic",
    "h-game",
    "hentai",
  ].map((type) => `media_type.${type}`),
  "view.person",
  "view.studio",
  "view.publisher",
  "view.character",
  "view.search",
];

function viewer({ without = [], visibleGatedTypes = [] } = {}) {
  const held = new Set(EVERY_KEY.filter((key) => !without.includes(key)));
  return { visibleGatedTypes, has: (permission) => held.has(permission) };
}

beforeEach(() => {
  auth.value = viewer();
});

describe("getResultName", () => {
  it("names a game", () => {
    expect(
      getResultName({
        type: "game",
        game_name_cn: "艾爾登法環",
        game_name_en: "Elden Ring",
      }),
    ).toBe("艾爾登法環");
  });

  it("falls back down the chain when a game has no Chinese title", () => {
    expect(
      getResultName({ type: "game", game_name_cn: null, game_name_en: "Elden Ring" }),
    ).toBe("Elden Ring");
  });

  it("leads with the English title for a comic", () => {
    expect(
      getResultName({
        type: "comic",
        comic_name_cn: "蝙蝠俠",
        comic_name_en: "Batman",
      }),
    ).toBe("Batman");
  });

  it("uses the resolved display_name for a person", () => {
    expect(
      getResultName({ type: "person", display_name: "Hayao Miyazaki" }),
    ).toBe("Hayao Miyazaki");
  });

  it("names a seasonal by its one string", () => {
    expect(getResultName({ type: "seasonal", seasonal: "2026 Spring" })).toBe(
      "2026 Spring",
    );
  });

  it("shows a dash, not a placeholder sentence, when nothing is named", () => {
    expect(getResultName({ type: "game" })).toBe("—");
    expect(getResultName({ type: "series" })).toBe("—");
    expect(getResultName({ type: "person" })).toBe("—");
  });
});

describe("mergeBuckets", () => {
  const rows = (type, n, exactAt = []) =>
    Array.from({ length: n }, (_, i) => ({ type, i, exact: exactAt.includes(i) }));
  const isExact = (row) => row.exact;

  it("caps the dropdown at eight rows", () => {
    expect(MAX_RESULTS).toBe(8);
    const buckets = [rows("franchise", 9), rows("anime", 9), rows("manga", 9)];
    expect(mergeBuckets(buckets, [1, 2, 1], isExact)).toHaveLength(8);
  });

  it("gives every matching type a row before any type gets a second", () => {
    const buckets = [rows("franchise", 9), rows("anime", 9), rows("manga", 9)];
    const out = mergeBuckets(buckets, [1, 1, 1], isExact);
    expect(out.slice(0, 3).map((r) => r.type)).toEqual([
      "franchise",
      "anime",
      "manga",
    ]);
  });

  it("fills the slots no type claimed from the types that still have rows", () => {
    const out = mergeBuckets([rows("movie", 20), []], [1, 1], isExact);
    expect(out).toHaveLength(8);
    expect(out.every((r) => r.type === "movie")).toBe(true);
  });

  it("keeps an exact match from a late bucket even when early quotas fill the cap", () => {
    const buckets = [
      rows("collection", 9),
      rows("franchise", 9),
      rows("series", 9),
      rows("anime", 9),
      rows("movie", 9),
      rows("manga", 9),
      rows("novel", 9),
      rows("comic", 9),
      rows("publisher", 9, [4]),
    ];
    const out = mergeBuckets(buckets, [1, 1, 1, 2, 1, 1, 1, 1, 0], isExact);
    expect(out).toHaveLength(8);
    expect(out[0]).toMatchObject({ type: "publisher", i: 4 });
  });
});

describe("the type badge", () => {
  it("gives every result type its own hue", () => {
    const hues = RESULT_TYPES.map(typeHue);
    expect(hues.every(Boolean)).toBe(true);
    expect(new Set(hues).size).toBe(RESULT_TYPES.length);
  });
});

// The dropdown itself: typing opens it, a search that navigates closes it,
// and a response still in flight when the reader pressed Enter must not
// bring it back over the results page.
describe("the suggestion dropdown", () => {
  const PAYLOAD = {
    results: {
      anime: [{ id: 1, public_id: "a1", anime_name_en: "Frieren" }],
      franchise: [{ id: 2, public_id: "f2", franchise_name_en: "Frieren" }],
    },
  };

  let resolvers;
  beforeEach(() => {
    resolvers = [];
    // Each request hangs until the test releases it, so the test decides
    // whether the response lands before or after Enter.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolvers.push(() =>
              resolve({ ok: true, json: () => Promise.resolve(PAYLOAD) }),
            );
          }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderSearch() {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="*" element={<NavSearch variant="sheet" />} />
        </Routes>
      </MemoryRouter>,
    );
    return screen.getByRole("textbox", { name: "Search the collection" });
  }

  const suggestions = () =>
    screen.queryByRole("listbox", { name: "Search suggestions" });

  async function releaseAll() {
    await act(async () => {
      resolvers.splice(0).forEach((release) => release());
    });
  }

  async function typeAndAnswer(user, input, text) {
    await user.type(input, text);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await releaseAll();
    return screen.findByRole("listbox", { name: "Search suggestions" });
  }

  it("opens once the response arrives, asking for no more rows than it shows", async () => {
    const user = userEvent.setup();
    const list = await typeAndAnswer(user, renderSearch(), "frieren");
    expect(within(list).getAllByRole("option")).toHaveLength(2);
    const url = new URL(fetch.mock.calls[0][0], "http://x");
    expect(url.searchParams.get("limit")).toBe(String(MAX_RESULTS));
  });

  it("colours each row's badge by its type", async () => {
    const user = userEvent.setup();
    const list = await typeAndAnswer(user, renderSearch(), "frieren");
    const badge = within(list).getByText("ANIME");
    for (const cls of typeHue("anime").split(" ")) {
      expect(badge).toHaveClass(cls);
    }
    expect(within(list).getByText("FRAN")).toHaveClass("text-scope-franchise");
  });

  it("closes on Enter", async () => {
    const user = userEvent.setup();
    await typeAndAnswer(user, renderSearch(), "frieren");
    await user.keyboard("{Enter}");
    expect(suggestions()).not.toBeInTheDocument();
  });

  it("stays closed when the response lands after Enter", async () => {
    const user = userEvent.setup();
    const input = renderSearch();
    await user.type(input, "frieren");
    // The debounce has fired and the request is in flight.
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    await user.keyboard("{Enter}");
    await releaseAll();
    expect(suggestions()).not.toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("stays closed when the response lands after Escape, keeping the query", async () => {
    const user = userEvent.setup();
    const input = renderSearch();
    await user.type(input, "frieren");
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    await user.keyboard("{Escape}");
    await releaseAll();
    expect(suggestions()).not.toBeInTheDocument();
    expect(input).toHaveValue("frieren");
  });

  it("stays closed when the response lands after an outside click", async () => {
    const user = userEvent.setup();
    const input = renderSearch();
    await user.type(input, "frieren");
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    await user.click(document.body);
    await releaseAll();
    expect(suggestions()).not.toBeInTheDocument();
    expect(input).toHaveValue("frieren");
  });

  it("stays closed when a result is clicked before a newer response lands", async () => {
    const user = userEvent.setup();
    const input = renderSearch();
    const list = await typeAndAnswer(user, input, "frieren");

    // A further keystroke starts a second request, then the reader clicks a
    // row from the first before it answers.
    await user.type(input, "!");
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await user.click(within(list).getAllByRole("option")[0]);
    await releaseAll();
    expect(suggestions()).not.toBeInTheDocument();
  });
});

// The scope menu offers a type only when the server would send its bucket:
// media_type.<type> for a media type (and, for a gated one, the mode showing
// it), view.<kind> for person, studio and publisher. The groups and seasonal
// are always offered.
describe("the scope menu", () => {
  function openScopes() {
    render(
      <MemoryRouter>
        <NavSearch variant="sheet" />
      </MemoryRouter>,
    );
    return userEvent
      .setup()
      .click(screen.getByRole("button", { name: "All" }))
      .then(() => screen.getAllByRole("option").map((o) => o.textContent));
  }

  it("offers every ungated type and entity kind to a viewer holding every key", async () => {
    const offered = await openScopes();
    for (const label of ["Collection", "Seasonal", "Manga", "Person", "Studio"]) {
      expect(offered).toContain(label);
    }
  });

  it("leaves out a media type without its media_type key", async () => {
    auth.value = viewer({ without: ["media_type.manga"] });
    const offered = await openScopes();
    expect(offered).not.toContain("Manga");
    expect(offered).toContain("Anime");
  });

  it("leaves out an entity kind without its view key", async () => {
    auth.value = viewer({ without: ["view.person"] });
    const offered = await openScopes();
    expect(offered).not.toContain("Person");
    expect(offered).toContain("Studio");
  });

  it("leaves out a gated type the mode hides, though the role holds it", async () => {
    const offered = await openScopes();
    expect(offered).not.toContain("H-Comic");
  });

  it("offers a gated type the mode shows and the role holds", async () => {
    auth.value = viewer({ visibleGatedTypes: ["h-comic"] });
    const offered = await openScopes();
    expect(offered).toContain("H-Comic");
  });

  it("leaves out a gated type the mode shows but the role does not hold", async () => {
    auth.value = viewer({
      without: ["media_type.h-comic"],
      visibleGatedTypes: ["h-comic"],
    });
    const offered = await openScopes();
    expect(offered).not.toContain("H-Comic");
  });

  it("always offers the groups and seasonal", async () => {
    auth.value = viewer({ without: EVERY_KEY });
    const offered = await openScopes();
    expect(offered).toEqual(["All", "Collection", "Franchise", "Series", "Seasonal"]);
  });
});

// A row opens its entity's page only through that kind's key - the same
// rule as every entity link (useEntityHref). The payload carries a person
// either way; only the viewer's key changes.
describe("an entity row", () => {
  const PAYLOAD = {
    results: {
      person: [{ public_id: "p1", name_en: "Hayao Miyazaki", display_name: "Hayao Miyazaki" }],
    },
  };

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(PAYLOAD) })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function LocationProbe() {
    return <div data-testid="location">{useLocation().pathname}</div>;
  }

  async function findRow() {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <NavSearch variant="sheet" />
        <LocationProbe />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.type(
      screen.getByRole("textbox", { name: "Search the collection" }),
      "miyazaki",
    );
    const list = await screen.findByRole("listbox", { name: "Search suggestions" });
    return { user, row: within(list).getByRole("option") };
  }

  it("opens the person's page with view.person", async () => {
    const { user, row } = await findRow();
    expect(row).not.toHaveAttribute("aria-disabled");
    await user.click(row);
    expect(screen.getByTestId("location")).toHaveTextContent("/person/p1/hayao-miyazaki");
  });

  it("is plain text without view.person", async () => {
    auth.value = viewer({ without: ["view.person"] });
    const { user, row } = await findRow();
    expect(row).toHaveAttribute("aria-disabled", "true");
    expect(row.tagName).not.toBe("BUTTON");
    expect(row).toHaveTextContent("Hayao Miyazaki");
    await user.click(row);
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/$/);
  });
});
