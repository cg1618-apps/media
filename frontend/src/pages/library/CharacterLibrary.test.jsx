import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CharacterLibrary from "./CharacterLibrary";

// A session that may see every gated type, so the Restricted chip is drawn.
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ visibleGatedTypes: ["h-comic", "h-game", "hentai"] }),
}));

const CHARACTERS = [
  {
    system_id: "1",
    public_id: "c1",
    name_en: "Yuki Nagato",
    display_name: "Yuki Nagato",
    casting_count: 3,
    media_types: ["anime", "novel"],
    my_rating: "A",
    gender: "女",
    role: "Main",
    display_photo_file: "library/yuki.jpg",
  },
  {
    system_id: "2",
    public_id: "c2",
    name_cn: "渡部高志",
    display_name: "渡部高志",
    casting_count: 8,
    media_types: ["hentai"],
    my_rating: null,
    gender: "男",
  },
  {
    system_id: "3",
    public_id: "c3",
    name_jp: "諫山創",
    display_name: "諫山創",
    casting_count: 1,
    media_types: ["h-comic", "manga"],
    my_rating: "S",
    gender: null,
    role: "Core",
  },
  {
    system_id: "4",
    public_id: "c4",
    name_alt: "Nickname Only",
    display_name: "Nickname Only",
    casting_count: 0,
    media_types: [],
    my_rating: "B",
    gender: "其他",
  },
];

function renderLibrary() {
  return render(
    <MemoryRouter>
      <CharacterLibrary />
    </MemoryRouter>,
  );
}

// The library opens on the default (restricted types off). A test about
// search, sort or one group starts from nothing on instead, so every row is
// in play.
async function clearAll(user) {
  await user.click(screen.getByRole("button", { name: "Clear all" }));
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(CHARACTERS) }),
    ),
  );
});

describe("CharacterLibrary", () => {
  it("fetches via the character endpoint helper", async () => {
    renderLibrary();
    await waitFor(() =>
      expect(screen.getByText("Yuki Nagato")).toBeInTheDocument(),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/character/",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("stamps my_rating on a rated character's card and nothing on an unrated one", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await waitFor(() =>
      expect(screen.getByText("Yuki Nagato")).toBeInTheDocument(),
    );
    await clearAll(user);

    const yuki = screen.getByText("Yuki Nagato").closest("a");
    expect(within(yuki).getByLabelText("Rating A")).toBeInTheDocument();
    const unrated = screen.getByText("渡部高志").closest("a");
    expect(within(unrated).queryByLabelText(/^Rating /)).not.toBeInTheDocument();
  });

  it("searches across all four name fields", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await waitFor(() =>
      expect(screen.getByText("Yuki Nagato")).toBeInTheDocument(),
    );

    await clearAll(user);
    const box = screen.getByRole("searchbox");
    for (const [term, kept] of [
      ["Yuki", "Yuki Nagato"],
      ["渡部", "渡部高志"],
      ["諫山", "諫山創"],
      ["Nickname", "Nickname Only"],
    ]) {
      await user.clear(box);
      await user.type(box, term);
      await waitFor(() => expect(screen.getByText(kept)).toBeInTheDocument());
      expect(screen.queryAllByRole("link")).toHaveLength(1);
    }
  });

  it("sorts by casting count and shows casting_count on the card, not credit_count", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await waitFor(() =>
      expect(screen.getByText("Yuki Nagato")).toBeInTheDocument(),
    );
    await clearAll(user);

    // The card must read casting_count (8), never a blank/zero credit_count.
    const card = screen.getByText("渡部高志").closest("a");
    expect(card).toHaveTextContent("8 castings");

    await user.selectOptions(screen.getByLabelText(/sort/i), "casting_count");
    const cards = screen.getAllByRole("link").map((a) => a.textContent);
    expect(cards[0]).toContain("渡部高志");
  });

  it("sorts by my rating, best first, unrated last", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await waitFor(() =>
      expect(screen.getByText("Yuki Nagato")).toBeInTheDocument(),
    );
    await clearAll(user);
    await user.selectOptions(screen.getByLabelText(/sort/i), "my_rating");
    const cards = screen.getAllByRole("link").map((a) => a.textContent);
    expect(cards[0]).toContain("諫山創");
    expect(cards[3]).toContain("渡部高志");
  });

  it("shows the server-resolved display photo on the card", async () => {
    renderLibrary();
    const card = (await screen.findByText("Yuki Nagato")).closest("a");
    expect(card.querySelector("img")).toHaveAttribute(
      "src",
      "/static/library/yuki.jpg",
    );
  });

  it("filters by entry type, OR within the group and AND across groups", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await waitFor(() =>
      expect(screen.getByText("Yuki Nagato")).toBeInTheDocument(),
    );
    await clearAll(user);

    await user.click(screen.getByRole("button", { name: "Manga" }));
    await user.click(screen.getByRole("button", { name: "Novel" }));
    let cards = screen.getAllByRole("link").map((a) => a.textContent);
    expect(cards).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "S" }));
    cards = screen.getAllByRole("link").map((a) => a.textContent);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toContain("諫山創");
  });

  it("turns on every restricted type from the Restricted chip, and Clear all empties it", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await waitFor(() =>
      expect(screen.getByText("Yuki Nagato")).toBeInTheDocument(),
    );
    await clearAll(user);
    // Characters are never cast on an h-game, so it is not offered.
    expect(screen.queryByRole("button", { name: "H-Game" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Restricted" }));
    const cards = screen.getAllByRole("link").map((a) => a.textContent);
    expect(cards).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Hentai" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.getAllByRole("link")).toHaveLength(4);
  });

  it("filters by gender, with Not set for an unset gender", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await waitFor(() =>
      expect(screen.getByText("Yuki Nagato")).toBeInTheDocument(),
    );
    const genderGroup = screen.getByText("Gender").parentElement;
    await user.click(within(genderGroup).getByRole("button", { name: "Not set" }));
    const cards = screen.getAllByRole("link").map((a) => a.textContent);
    expect(cards).toEqual([expect.stringContaining("諫山創")]);
  });

  it("filters by the character's own role, with Not set for none", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await waitFor(() =>
      expect(screen.getByText("Yuki Nagato")).toBeInTheDocument(),
    );
    await clearAll(user);
    const roleGroup = screen.getByText("Role").parentElement;
    await user.click(within(roleGroup).getByRole("button", { name: "Core" }));
    let cards = screen.getAllByRole("link").map((a) => a.textContent);
    expect(cards).toEqual([expect.stringContaining("諫山創")]);

    await user.click(within(roleGroup).getByRole("button", { name: "Not set" }));
    cards = screen.getAllByRole("link").map((a) => a.textContent);
    expect(cards).toHaveLength(3);
  });

  // 渡部高志 is cast on hentai only - the row that makes the default bite.
  it("hides a restricted-only character by default, and shows it once Restricted is ticked", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await waitFor(() =>
      expect(screen.getByText("Yuki Nagato")).toBeInTheDocument(),
    );
    expect(screen.queryByText("渡部高志")).not.toBeInTheDocument();
    // Cast on h-comic AND manga: still listed.
    expect(screen.getByText("諫山創")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Restricted" }));
    expect(screen.getByText("渡部高志")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(4);
  });

  it("lists a character cast nowhere yet by default, under No entries", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await waitFor(() =>
      expect(screen.getByText("Nickname Only")).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "No entries" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "No entries" }));
    expect(screen.queryByText("Nickname Only")).not.toBeInTheDocument();
  });
  describe("identities", () => {
    const WITH_CONAN = {
      system_id: "5",
      public_id: "c5",
      name_en: "Kudo Shinichi",
      display_name: "Kudo Shinichi",
      casting_count: 2,
      media_types: ["anime"],
      my_rating: "A",
      identities: [
        {
          system_id: "i1",
          name_en: "Edogawa Conan",
          display_name: "Edogawa Conan",
          display_gender: "男",
          display_photo_file: "character-identity/i1.jpg",
        },
      ],
    };

    beforeEach(() => {
      vi.stubGlobal(
        "fetch",
        vi.fn(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve([...CHARACTERS, WITH_CONAN]),
          }),
        ),
      );
    });

    it("shows identity cards and can hide them", async () => {
      const user = userEvent.setup();
      renderLibrary();
      const conan = (await screen.findByText("Edogawa Conan")).closest("a");
      expect(screen.getByText(/identity of Kudo Shinichi/i)).toBeInTheDocument();
      expect(conan).toHaveAttribute("href", expect.stringContaining("#identity-i1"));
      await user.click(screen.getByRole("button", { name: "Characters" }));
      expect(screen.queryByText("Edogawa Conan")).not.toBeInTheDocument();
      expect(screen.getByText("Kudo Shinichi")).toBeInTheDocument();
    });

    it("the Identities group filters by whether the character has identities", async () => {
      const user = userEvent.setup();
      renderLibrary();
      await screen.findByText("Edogawa Conan");
      await user.click(screen.getByRole("button", { name: "No identities" }));
      expect(screen.queryByText("Edogawa Conan")).not.toBeInTheDocument();
      expect(screen.queryByText("Kudo Shinichi")).not.toBeInTheDocument();
      expect(screen.getByText("Yuki Nagato")).toBeInTheDocument();
    });

    it("an identity is found by its character's other names, and the character by the identity's", async () => {
      const user = userEvent.setup();
      renderLibrary();
      await screen.findByText("Edogawa Conan");
      await user.type(screen.getByRole("searchbox"), "Conan");
      expect(screen.getByText("Kudo Shinichi")).toBeInTheDocument();
      expect(screen.getByText("Edogawa Conan")).toBeInTheDocument();
    });
  });
});
