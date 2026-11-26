import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PublisherLibrary from "./PublisherLibrary";

// The page is behind view.publisher, so its viewer holds it and the cards
// link (useEntityHref). self.list (the viewer's own rating) is held unless a
// test takes it away.
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
  held.add("view.publisher").add("self.list");
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

const PUBLISHERS = [
  {
    system_id: "1",
    public_id: "pb1",
    name_en: "Bandai Namco",
    display_name: "Bandai Namco",
    credit_count: 12,
    media_types: ["game"],
    scopes: ["game"],
    country: "Japan",
  },
  {
    system_id: "2",
    public_id: "pb2",
    name_en: "Muse Communication",
    name_cn: "木棉花",
    display_name_field: "cn",
    display_name: "木棉花",
    credit_count: 30,
    media_types: ["anime"],
    scopes: ["anime", "manga"],
    country: "Taiwan",
  },
  // Offered on books but credited on nothing yet.
  {
    system_id: "3",
    public_id: "pb3",
    name_en: "Kadokawa Taiwan",
    display_name: "Kadokawa Taiwan",
    credit_count: 0,
    media_types: [],
    scopes: ["book"],
    country: null,
  },
];

beforeEach(() => {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(PUBLISHERS) }),
  );
});

function renderPage() {
  return render(
    <MemoryRouter>
      <PublisherLibrary />
    </MemoryRouter>,
  );
}

describe("PublisherLibrary", () => {
  it("lists every publisher by its display name", async () => {
    renderPage();
    expect(await screen.findByText("木棉花")).toBeInTheDocument();
    expect(screen.getByText("Bandai Namco")).toBeInTheDocument();
  });

  it("searches across every name field, not just the displayed one", async () => {
    renderPage();
    await screen.findByText("木棉花");
    await userEvent.type(screen.getByRole("searchbox"), "Muse Communication");
    await waitFor(() => {
      expect(screen.getByText("木棉花")).toBeInTheDocument();
      expect(screen.queryByText("Bandai Namco")).not.toBeInTheDocument();
    });
  });

  it("links each publisher to its detail page", async () => {
    renderPage();
    expect(await screen.findByRole("link", { name: /木棉花/ })).toHaveAttribute(
      "href",
      "/publisher/pb2/muse-communication",
    );
  });

  it("opens with the filter panel shown, no entry type ticked, and no Restricted chip", async () => {
    renderPage();
    await screen.findByText("木棉花");
    expect(screen.getByRole("button", { name: /^Filters/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    for (const name of ["Anime", "Anime Movie", "Manga", "Book", "Comic", "Game", "No entries"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
    }
    expect(screen.queryByRole("button", { name: "Restricted" })).not.toBeInTheDocument();
    // An uncredited publisher is listed by default.
    expect(screen.getByText("Kadokawa Taiwan")).toBeInTheDocument();
  });

  it("matches a type the publisher is offered on as well as one it is credited on", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("木棉花");
    await user.click(screen.getByRole("button", { name: "Manga" }));
    // Muse is credited on anime only, but offered on manga.
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual([
      expect.stringContaining("木棉花"),
    ]);
    await user.click(screen.getByRole("button", { name: "Book" }));
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("filters by country, with Not set for none", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("木棉花");
    const country = screen.getByText("Country").parentElement;
    await user.click(within(country).getByRole("button", { name: "Taiwan" }));
    await user.click(within(country).getByRole("button", { name: "Not set" }));
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.queryByText("Bandai Namco")).not.toBeInTheDocument();
  });
});

// Content rating follows the active access mode: it offers only the ratings
// the server can serve in it, and is not drawn where that is Normal alone.
describe("PublisherLibrary and the Content rating filter", () => {
  it("draws no Content rating group in the normal mode", async () => {
    session.modeKey = "normal";
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("木棉花");
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
            PUBLISHERS.map((r) => (r.display_name === "Bandai Namco" ? { ...r, content_rating: "borderline" } : r)),
          ),
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("木棉花");
    await openAdvanced(user);
    const group = screen.getByText("Content rating").parentElement;
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Normal", "Borderline (15+)",
    ]);
    await user.click(within(group).getByRole("button", { name: "Borderline (15+)" }));
    const cards = screen.getAllByRole("link").map((a) => a.textContent);
    expect(cards).toEqual([expect.stringContaining("Bandai Namco")]);
  });

  it("offers all three in the unrestricted mode, then Relation and My Rating", async () => {
    session.modeKey = "unrestricted";
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("木棉花");
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
describe("PublisherLibrary and the viewer's own rating", () => {
  it("offers no My rating sort or filter without self.list", async () => {
    held.delete("self.list");
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("木棉花");
    expect(screen.queryByRole("option", { name: "My rating" })).not.toBeInTheDocument();
    await openAdvanced(user, { required: false });
    expect(screen.queryByText("My Rating")).not.toBeInTheDocument();
  });

  it("offers both with self.list", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("木棉花");
    expect(screen.getByRole("option", { name: "My rating" })).toBeInTheDocument();
    await openAdvanced(user);
    expect(screen.getByText("My Rating")).toBeInTheDocument();
  });
});

describe("PublisherLibrary list view", () => {
  it("draws a table of name, kind, country, entry types, credits and my rating", async () => {
    renderPage();
    await screen.findByText("木棉花");
    await userEvent.click(screen.getByRole("button", { name: "Table view" }));
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Publisher", "Kind", "Country", "Entry types", "Credits", "My",
    ]);
    const row = within(table).getByText("木棉花").closest("tr");
    // Credited on anime and offered on manga: both kinds.
    expect(within(row).getByText("台灣出版社")).toBeInTheDocument();
    expect(within(row).getByText("台灣代理商")).toBeInTheDocument();
    expect(within(row).getByText("Taiwan")).toBeInTheDocument();
  });
});
