import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PersonLibrary from "./PersonLibrary";

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

const PEOPLE = [
  {
    system_id: "1",
    public_id: "p1",
    name_en: "Jon Favreau",
    display_name: "Jon Favreau",
    credit_count: 3,
    roles: [{ role: "director", scope: "movie" }],
    media_types: ["movie"],
    my_rating: "B",
    gender: "男",
  },
  {
    system_id: "2",
    public_id: "p2",
    name_cn: "渡部高志",
    display_name: "渡部高志",
    credit_count: 8,
    roles: [{ role: "director", scope: "anime" }],
    media_types: ["anime", "h-game"],
    my_rating: "S",
    gender: "男",
  },
  {
    system_id: "3",
    public_id: "p3",
    name_jp: "諫山創",
    display_name: "諫山創",
    credit_count: 1,
    roles: [{ role: "author", scope: "manga" }],
    media_types: ["manga"],
    my_rating: null,
    gender: null,
  },
  {
    system_id: "4",
    public_id: "p4",
    name_alt: "Pen Name",
    display_name: "Pen Name",
    credit_count: 0,
    roles: [],
    media_types: [],
  },
  // Credited on a gated type only: hidden until Restricted is ticked.
  {
    system_id: "6",
    public_id: "p6",
    name_en: "Circle Artist",
    display_name: "Circle Artist",
    credit_count: 2,
    roles: [{ role: "illustrator", scope: "h-comic" }],
    media_types: ["h-comic"],
    my_rating: null,
    gender: null,
  },
];

const SEIYUU = [
  {
    system_id: "5",
    public_id: "p5",
    name_en: "Miyu Irino",
    display_name: "Miyu Irino",
    credit_count: 0,
    roles: [{ role: "seiyuu", scope: "anime" }],
    media_types: [],
  },
];

function renderLibrary(props) {
  return render(
    <MemoryRouter>
      <PersonLibrary {...props} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(PEOPLE) }),
    ),
  );
});

describe("PersonLibrary", () => {
  it("searches across all four name fields", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await waitFor(() =>
      expect(screen.getByText("Jon Favreau")).toBeInTheDocument(),
    );

    const box = screen.getByRole("searchbox");
    for (const [term, kept] of [
      ["Favreau", "Jon Favreau"],
      ["渡部", "渡部高志"],
      ["諫山", "諫山創"],
      ["Pen", "Pen Name"],
    ]) {
      await user.clear(box);
      await user.type(box, term);
      await waitFor(() => expect(screen.getByText(kept)).toBeInTheDocument());
      expect(screen.queryAllByRole("link")).toHaveLength(1);
    }
  });

  it("sorts by credit count", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await waitFor(() =>
      expect(screen.getByText("渡部高志")).toBeInTheDocument(),
    );

    await user.selectOptions(screen.getByLabelText(/sort/i), "credit_count");
    const cards = screen.getAllByRole("link").map((a) => a.textContent);
    expect(cards[0]).toContain("渡部高志");
  });

  it("filters by person type", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await waitFor(() =>
      expect(screen.getByText("Jon Favreau")).toBeInTheDocument(),
    );

    // The person types read in Chinese: 作家 is Author.
    await user.click(screen.getByRole("button", { name: "作家" }));
    const cards = screen.getAllByRole("link").map((a) => a.textContent);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toContain("諫山創");
  });

  it("offers h-game under Restricted and matches a person credited on it", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await waitFor(() =>
      expect(screen.getByText("Jon Favreau")).toBeInTheDocument(),
    );
    // From the empty default: H-Game alone.
    await user.click(screen.getByRole("button", { name: "H-Game" }));
    const cards = screen.getAllByRole("link").map((a) => a.textContent);
    expect(cards).toEqual([expect.stringContaining("渡部高志")]);
    // One child of three on: the parent is not active.
    expect(screen.getByRole("button", { name: "Restricted" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("ANDs the person type with rating", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await waitFor(() =>
      expect(screen.getByText("Jon Favreau")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "導演" }));
    expect(screen.getAllByRole("link")).toHaveLength(2);
    await openAdvanced(user);
    await user.click(screen.getByRole("button", { name: "Unrated" }));
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "S" }));
    const cards = screen.getAllByRole("link").map((a) => a.textContent);
    expect(cards).toEqual([expect.stringContaining("渡部高志")]);
  });

  it("sorts by my rating, best first", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await waitFor(() =>
      expect(screen.getByText("渡部高志")).toBeInTheDocument(),
    );
    await user.selectOptions(screen.getByLabelText(/sort/i), "my_rating");
    const cards = screen.getAllByRole("link").map((a) => a.textContent);
    expect(cards[0]).toContain("渡部高志");
    expect(cards[1]).toContain("Jon Favreau");
  });

  it("asks for every person, unfiltered", async () => {
    renderLibrary();

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url] = fetch.mock.calls[0];
    expect(url).toBe("/api/person/");
  });

  it("opens with the panel shown and no entry type ticked", async () => {
    renderLibrary();
    await waitFor(() =>
      expect(screen.getByText("Jon Favreau")).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /^Filters/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    for (const name of [
      "Anime", "Movie", "Game", "No entries", "Restricted", "H-Comic", "Hentai", "H-Game",
    ]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
    }
    // Nothing to reset to yet.
    expect(screen.queryByRole("button", { name: "Reset to Default" })).not.toBeInTheDocument();
  });

  // The restricted-only row is what makes the default bite: without it the
  // default would hide nothing and this would pass vacuously.
  it("hides a restricted-only person by default and shows them once Restricted is ticked", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await waitFor(() =>
      expect(screen.getByText("Jon Favreau")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Circle Artist")).not.toBeInTheDocument();
    // A person credited on a gated AND a plain type is still listed.
    expect(screen.getByText("渡部高志")).toBeInTheDocument();
    // So is one with no entries at all.
    expect(screen.getByText("Pen Name")).toBeInTheDocument();

    // Restricted alone narrows to the people credited on a restricted type.
    await user.click(screen.getByRole("button", { name: "Restricted" }));
    expect(screen.getByText("Circle Artist")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  // Nothing ticked reads as every plain type and No entries ticked - the
  // two show the same four people.
  it("shows with nothing ticked exactly what every plain type ticked shows", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await waitFor(() =>
      expect(screen.getByText("Jon Favreau")).toBeInTheDocument(),
    );
    const names = () => screen.getAllByRole("link").map((a) => a.textContent);
    const none = names();
    expect(none).toHaveLength(4);
    for (const name of [
      "Anime", "Anime Movie", "Movie", "TV Show", "Cartoon", "Manga", "Book",
      "Comic", "Game", "No entries",
    ]) {
      await user.click(screen.getByRole("button", { name }));
    }
    expect(names()).toEqual(none);

    // Reset (and Clear all) return to nothing ticked.
    await user.click(screen.getByRole("button", { name: "Reset to Default" }));
    expect(screen.getByRole("button", { name: "Anime" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(names()).toEqual(none);
    expect(screen.queryByRole("button", { name: "Reset to Default" })).not.toBeInTheDocument();
  });

  it("finds a seiyuu under the Type group's 聲優", async () => {
    fetch.mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([...PEOPLE, ...SEIYUU]) }),
    );
    const user = userEvent.setup();
    renderLibrary();
    expect(await screen.findByRole("heading", { name: "People" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "聲優" }));
    const cards = screen.getAllByRole("link").map((a) => a.textContent);
    expect(cards).toEqual([expect.stringContaining("Miyu Irino")]);
  });

  it("keeps the Type group on /library/person", async () => {
    renderLibrary();
    await waitFor(() =>
      expect(screen.getByText("Jon Favreau")).toBeInTheDocument(),
    );
    const typeGroup = screen.getByText("Type").parentElement;
    expect(within(typeGroup).getByRole("button", { name: "導演" })).toBeInTheDocument();
  });

  it("lists a seiyuu who has never been cast", async () => {
    fetch.mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(SEIYUU) }),
    );

    renderLibrary();

    await waitFor(() =>
      expect(screen.getByText("Miyu Irino")).toBeInTheDocument(),
    );
    expect(screen.getByText("0 credits")).toBeInTheDocument();
  });
});

// My rating is the viewer's own (self.list). Without the key the library
// offers no rating sort or filter at all - not empty ones; the same rows with
// the key offer both, so the absence is the permission's doing.
describe("PersonLibrary and the viewer's own rating", () => {
  it("offers no My rating sort or filter without self.list", async () => {
    held.delete("self.list");
    const user = userEvent.setup();
    renderLibrary();
    await screen.findByText("Jon Favreau");
    expect(screen.queryByRole("option", { name: "My rating" })).not.toBeInTheDocument();
    await openAdvanced(user, { required: false });
    expect(screen.queryByText("My Rating")).not.toBeInTheDocument();
  });

  it("offers both with self.list", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await screen.findByText("Jon Favreau");
    expect(screen.getByRole("option", { name: "My rating" })).toBeInTheDocument();
    await openAdvanced(user);
    expect(screen.getByText("My Rating")).toBeInTheDocument();
  });
});

// Content rating follows the active access mode: it offers only the ratings
// the server can serve in it, and is not drawn where that is Normal alone.
describe("PersonLibrary and the Content rating filter", () => {
  it("draws no Content rating group in the normal mode", async () => {
    session.modeKey = "normal";
    const user = userEvent.setup();
    renderLibrary();
    await screen.findByText("Jon Favreau");
    await openAdvanced(user);
    // My Rating is drawn in the same section, so the section is open.
    expect(screen.getByText("My Rating")).toBeInTheDocument();
    expect(screen.queryByText("Content rating")).not.toBeInTheDocument();
  });

  it("offers Normal and Borderline in the borderline mode, and filters by them", async () => {
    session.modeKey = "borderline";
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            PEOPLE.map((p) => (p.display_name === "諫山創" ? { ...p, content_rating: "borderline" } : p)),
          ),
      }),
    );
    const user = userEvent.setup();
    renderLibrary();
    await screen.findByText("Jon Favreau");
    await openAdvanced(user);
    const group = screen.getByText("Content rating").parentElement;
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Normal", "Borderline (15+)",
    ]);
    await user.click(within(group).getByRole("button", { name: "Borderline (15+)" }));
    const cards = screen.getAllByRole("link").map((a) => a.textContent);
    expect(cards).toEqual([expect.stringContaining("諫山創")]);
  });

  it("offers all three in the unrestricted mode, before My Rating", async () => {
    session.modeKey = "unrestricted";
    const user = userEvent.setup();
    renderLibrary();
    await screen.findByText("Jon Favreau");
    await openAdvanced(user);
    const group = screen.getByText("Content rating").parentElement;
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Normal", "Borderline (15+)", "Unrestricted (18+)",
    ]);
    expect(inDrawnOrder(["My Rating", "Content rating"])).toEqual(["Content rating", "My Rating"]);
  });
});

describe("PersonLibrary list view", () => {
  it("draws a table whose Type column reads the person types in Chinese", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await screen.findByText("Jon Favreau");
    await user.click(screen.getByRole("button", { name: "Table view" }));
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Person", "Type", "Gender", "Entry types", "Credits", "My",
    ]);
    const row = within(table).getByText("諫山創").closest("tr");
    expect(within(row).getByText("作家")).toBeInTheDocument();
    expect(within(table).getByText("Jon Favreau").closest("tr")).toHaveTextContent("導演");
  });
});
