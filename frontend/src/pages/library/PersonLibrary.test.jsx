import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PersonLibrary from "./PersonLibrary";

// A session that may see every gated type, so the Restricted chip is drawn.
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ visibleGatedTypes: ["h-comic", "h-game", "hentai"] }),
}));

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

    await user.click(screen.getByRole("button", { name: "Author" }));
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
    // From an empty state: H-Game alone, not added to the default's types.
    await user.click(screen.getByRole("button", { name: "Clear all" }));
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
    await user.click(screen.getByRole("button", { name: "Director" }));
    expect(screen.getAllByRole("link")).toHaveLength(2);
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

  it("filters to seiyuu when rendered with role=\"seiyuu\"", async () => {
    renderLibrary({ role: "seiyuu" });

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url] = fetch.mock.calls[0];
    expect(url).toBe("/api/person/?role=seiyuu");
  });

  it("does not filter /library/person when role is unset", async () => {
    renderLibrary();

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url] = fetch.mock.calls[0];
    expect(url).toBe("/api/person/");
  });

  it("opens with the panel shown, every plain type and No entries on, the restricted ones off", async () => {
    renderLibrary();
    await waitFor(() =>
      expect(screen.getByText("Jon Favreau")).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /^Filters/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    for (const name of ["Anime", "Movie", "Game", "No entries"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "true");
    }
    for (const name of ["Restricted", "H-Comic", "Hentai", "H-Game"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
    }
    // Nothing to reset to yet.
    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "Restricted" }));
    expect(screen.getByText("Circle Artist")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(5);
  });

  it("Reset returns to the default; Clear all empties every group", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await waitFor(() =>
      expect(screen.getByText("Jon Favreau")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Clear all" }));
    // Nothing on: everyone, the restricted-only person included.
    expect(screen.getAllByRole("link")).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Anime" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getAllByRole("link")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Anime" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
  });

  it("names itself Seiyuu, not People, and drops the Type group, under role=\"seiyuu\"", async () => {
    fetch.mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(SEIYUU) }),
    );
    renderLibrary({ role: "seiyuu" });

    expect(await screen.findByRole("heading", { name: "Seiyuu" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "People" })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search seiyuu...")).toBeInTheDocument();
    expect(screen.getByText(/^1 seiyuu/)).toBeInTheDocument();
    expect(screen.queryByText("Type")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Director" })).not.toBeInTheDocument();
    expect(screen.getByText("Entry type")).toBeInTheDocument();
  });

  it("says seiyuu in the empty state too", async () => {
    fetch.mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([]) }),
    );
    renderLibrary({ role: "seiyuu" });
    expect(await screen.findByText("No seiyuu found")).toBeInTheDocument();
  });

  it("keeps the Type group on /library/person", async () => {
    renderLibrary();
    await waitFor(() =>
      expect(screen.getByText("Jon Favreau")).toBeInTheDocument(),
    );
    const typeGroup = screen.getByText("Type").parentElement;
    expect(within(typeGroup).getByRole("button", { name: "Director" })).toBeInTheDocument();
  });

  it("lists a seiyuu who has never been cast", async () => {
    fetch.mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(SEIYUU) }),
    );

    renderLibrary({ role: "seiyuu" });

    await waitFor(() =>
      expect(screen.getByText("Miyu Irino")).toBeInTheDocument(),
    );
    expect(screen.getByText("0 credits")).toBeInTheDocument();
  });
});
