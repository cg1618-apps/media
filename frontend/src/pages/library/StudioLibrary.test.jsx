import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StudioLibrary from "./StudioLibrary";

// A session that may see every gated type, so the Restricted chip is drawn.
// The page is behind its kind's view key, so its viewer holds the entity keys
// and the cards link (useEntityHref). self.list (the viewer's own rating) is
// held unless a test takes it away.
const held = new Set();
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    visibleGatedTypes: ["h-comic", "h-game", "hentai"],
    has: (p) => held.has(p),
    mode: session.modeKey ? { key: session.modeKey } : null,
  }),
}));
// The active access mode's key; null (no mode) unless a test sets one.
const session = { modeKey: null };
beforeEach(() => {
  held.clear();
  held.add("view.studio").add("view.publisher").add("view.person").add("view.character");
  held.add("self.list");
  session.modeKey = null;
});

// The advanced section is collapsed on every mount. A test of what it draws
// opens it first; one asserting a group's absence opens it when it is there,
// so the absence is not just the collapse.
async function openAdvanced(user, { required = true } = {}) {
  const toggle = required
    ? screen.getByRole("button", { name: /Advanced filters/ })
    : screen.queryByRole("button", { name: /Advanced filters/ });
  if (toggle) await user.click(toggle);
}

// The advanced section: the toggle and the groups it opens.
function advancedSection() {
  return screen.getByRole("button", { name: /Advanced filters/ }).parentElement;
}

// The given group labels (not chips) in the order the advanced section draws
// them.
function inDrawnOrder(labels) {
  return labels
    .map((label) => [label, within(advancedSection()).getByText(label, { ignore: "button" })])
    .sort(([, a], [, b]) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    .map(([label]) => label);
}

const STUDIOS = [
  { system_id: "1", public_id: "s1", name_en: "MAPPA", display_name: "MAPPA", credit_count: 12,
    media_types: ["anime"], countries: ["Japan"], my_rating: "A" },
  { system_id: "2", public_id: "s2", name_en: "Kyoto Animation", name_alt: "KyoAni",
    display_name_field: "alt", display_name: "KyoAni", credit_count: 30,
    media_types: ["anime", "anime-movie"], countries: ["Japan"], my_rating: "S" },
  { system_id: "3", public_id: "s3", name_jp: "京都アニメーション", display_name: "京都アニメーション",
    credit_count: 1, media_types: ["game"], countries: null, my_rating: null },
  // Credited on hentai only: hidden until Restricted is ticked.
  { system_id: "4", public_id: "s4", name_en: "Pink Pineapple", display_name: "Pink Pineapple",
    credit_count: 3, media_types: ["hentai"], restricted: true, countries: ["Japan"], my_rating: null },
  // Credited on nothing yet: listed by default under No entries.
  { system_id: "5", public_id: "s5", name_en: "Fresh Studio", display_name: "Fresh Studio",
    credit_count: 0, media_types: [], countries: ["China"], my_rating: null },
];

beforeEach(() => {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(STUDIOS) }),
  );
});

function renderPage() {
  return render(
    <MemoryRouter>
      <StudioLibrary />
    </MemoryRouter>,
  );
}

describe("StudioLibrary", () => {
  it("lists every studio by its display name", async () => {
    renderPage();
    expect(await screen.findByText("KyoAni")).toBeInTheDocument();
    expect(screen.getByText("MAPPA")).toBeInTheDocument();
  });

  it("searches across every name field, not just the displayed one", async () => {
    renderPage();
    await screen.findByText("KyoAni");
    await userEvent.type(screen.getByRole("searchbox"), "Kyoto Animation");
    await waitFor(() => {
      expect(screen.getByText("KyoAni")).toBeInTheDocument();
      expect(screen.queryByText("MAPPA")).not.toBeInTheDocument();
    });
  });

  it("links each studio to its detail page", async () => {
    renderPage();
    expect(await screen.findByRole("link", { name: /KyoAni/ })).toHaveAttribute(
      "href",
      "/studio/s2/kyoto-animation",
    );
  });

  it("opens with the filter panel shown and no entry type ticked", async () => {
    renderPage();
    await screen.findByText("KyoAni");
    expect(screen.getByRole("button", { name: /^Filters/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    for (const name of [
      "Anime", "Anime Movie", "Game", "No entries", "Restricted", "Hentai", "H-Game",
    ]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("hides a restricted-only studio by default and shows it once Restricted is ticked", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("KyoAni");
    expect(screen.queryByText("Pink Pineapple")).not.toBeInTheDocument();
    expect(screen.getByText("Fresh Studio")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(4);

    // Restricted alone narrows to the studios credited on a restricted type.
    await user.click(screen.getByRole("button", { name: "Restricted" }));
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual([
      expect.stringContaining("Pink Pineapple"),
    ]);
  });

  it("gives a country held by more than five studios its own chip, most-held first", async () => {
    // Seven studios name Japan, six Korea, five China: China stays under
    // Others with the one-off Poland, and the studio naming none is Not set.
    const studio = (n, countries) => ({
      system_id: String(n), public_id: `s${n}`, name_en: `Studio ${n}`,
      display_name: `Studio ${n}`, credit_count: 1, media_types: ["anime"],
      countries, my_rating: null,
    });
    const rows = [
      ...[1, 2, 3, 4, 5, 6].map((n) => studio(n, ["Japan"])),
      studio(7, ["Japan", "Korea", "China"]),
      ...[8, 9, 10, 11, 12].map((n) => studio(n, ["Korea"])),
      ...[13, 14, 15, 16].map((n) => studio(n, ["China"])),
      studio(17, ["Poland"]),
      studio(18, null),
    ];
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(rows) }));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Studio 18");
    const country = screen.getByText("Country").parentElement;
    expect(
      within(country).getAllByRole("button").map((b) => b.textContent),
    ).toEqual(["Japan", "Korea", "Others", "Not set"]);

    await user.click(within(country).getByRole("button", { name: "Others" }));
    const names = () => screen.getAllByRole("link").map((a) => a.textContent);
    // Studio 7 is under Japan and Korea too, and still an Other for China.
    expect(names()).toHaveLength(6);
    for (const n of [7, 13, 14, 15, 16, 17]) {
      expect(names()).toContainEqual(expect.stringContaining(`Studio ${n}`));
    }

    await user.click(within(country).getByRole("button", { name: "Others" }));
    await user.click(within(country).getByRole("button", { name: "Not set" }));
    expect(names()).toEqual([expect.stringContaining("Studio 18")]);
  });

  it("filters by my rating, ANDed with the entry type", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("KyoAni");
    await openAdvanced(user);
    const rating = screen.getByText("My Rating").parentElement;
    await user.click(within(rating).getByRole("button", { name: "Unrated" }));
    // Pink Pineapple is unrated too, but its only type is off by default.
    const cards = screen.getAllByRole("link").map((a) => a.textContent);
    expect(cards).toHaveLength(2);
    expect(screen.queryByText("Pink Pineapple")).not.toBeInTheDocument();
  });
});

// Content rating follows the active access mode: it offers only the ratings
// the server can serve in it, and is not drawn where that is Normal alone.
describe("StudioLibrary and the Content rating filter", () => {
  it("draws no Content rating group in the normal mode", async () => {
    session.modeKey = "normal";
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("KyoAni");
    await openAdvanced(user);
    // Relation is drawn in the same section, so the section is open.
    expect(screen.getByText("Relation")).toBeInTheDocument();
    expect(screen.queryByText("Content rating")).not.toBeInTheDocument();
  });

  it("offers Normal and Borderline in the borderline mode, and filters by them", async () => {
    session.modeKey = "borderline";
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            STUDIOS.map((r) => (r.display_name === "MAPPA" ? { ...r, content_rating: "borderline" } : r)),
          ),
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("KyoAni");
    await openAdvanced(user);
    const group = screen.getByText("Content rating").parentElement;
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Normal", "Borderline (15+)",
    ]);
    await user.click(within(group).getByRole("button", { name: "Borderline (15+)" }));
    const cards = screen.getAllByRole("link").map((a) => a.textContent);
    expect(cards).toEqual([expect.stringContaining("MAPPA")]);
  });

  it("offers all three in the unrestricted mode, then Relation and My Rating", async () => {
    session.modeKey = "unrestricted";
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("KyoAni");
    await openAdvanced(user);
    const group = screen.getByText("Content rating").parentElement;
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Normal", "Borderline (15+)", "Unrestricted (18+)",
    ]);
    expect(inDrawnOrder(["My Rating", "Relation", "Content rating"])).toEqual([
      "Content rating", "Relation", "My Rating",
    ]);
  });
});

// My rating is the viewer's own (self.list). Without the key the library
// offers no rating sort or filter at all - not empty ones; the same rows with
// the key offer both, so the absence is the permission's doing.
describe("StudioLibrary and the viewer's own rating", () => {
  it("offers no My rating sort or filter without self.list", async () => {
    held.delete("self.list");
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("KyoAni");
    expect(screen.queryByRole("option", { name: "My rating" })).not.toBeInTheDocument();
    await openAdvanced(user, { required: false });
    expect(screen.queryByText("My Rating")).not.toBeInTheDocument();
  });

  it("offers both with self.list", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("KyoAni");
    expect(screen.getByRole("option", { name: "My rating" })).toBeInTheDocument();
    await openAdvanced(user);
    expect(screen.getByText("My Rating")).toBeInTheDocument();
  });
});

// The list view: one table row per studio, the columns a studio is told apart
// by, and the row opening the studio's page.
describe("StudioLibrary list view", () => {
  it("draws a table of name, country, entry types, credits and my rating", async () => {
    renderPage();
    await screen.findByText("KyoAni");
    await userEvent.click(screen.getByRole("button", { name: "Table view" }));
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Studio", "Country", "Entry types", "Credits", "My",
    ]);
    const row = within(table).getByText("KyoAni").closest("tr");
    expect(within(row).getByText("Japan")).toBeInTheDocument();
    expect(within(row).getByText("Anime Movie")).toBeInTheDocument();
    expect(within(row).getByText("30")).toBeInTheDocument();
    expect(within(row).getByText("S")).toBeInTheDocument();
  });

  it("drops the My column for a viewer without a list", async () => {
    held.delete("self.list");
    renderPage();
    await screen.findByText("KyoAni");
    await userEvent.click(screen.getByRole("button", { name: "Table view" }));
    expect(screen.queryByRole("columnheader", { name: "My" })).toBeNull();
  });

  it("sorts by credits and reverses with the direction button", async () => {
    renderPage();
    await screen.findByText("KyoAni");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Sort" }), "credit_count");
    const first = () => screen.getAllByRole("link")[0].textContent;
    expect(first()).toContain("KyoAni");
    await userEvent.click(screen.getByRole("button", { name: "Reverse order" }));
    expect(first()).toContain("Fresh Studio");
  });
});
