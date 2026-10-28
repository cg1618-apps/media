// Person detail page: the profile controls it shares with Character.jsx -
// Quick edit, the rating select and the remark editor for an admin, text for
// everyone else - and the Naming card.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Person from "./Person";
import { ToastProvider } from "../../hooks/useToast";

let auth;
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => auth }));

const PERSON = {
  system_id: "p1",
  public_id: 7,
  name_en: "Hayao Miyazaki",
  name_cn: "宮崎駿",
  name_jp: "宮崎 駿",
  name_alt: null,
  display_name_field: "en",
  display_name: "Hayao Miyazaki",
  gender: "男",
  my_rating: "S",
  photo_file: null,
  display_photo_file: "library/totoro.jpg",
  remark: "Retired, twice.",
  credit_count: 1,
  roles: [{ role: "director", scope: "anime-movie" }],
};

function mockFetch(person = PERSON, groups = []) {
  global.fetch = vi.fn((url, init = {}) => {
    if (init.method === "PATCH") {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ...person, ...JSON.parse(init.body) }),
      });
    }
    if (String(url).endsWith("/entries")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ groups }) });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(person) });
  });
}

function WhereAmI() {
  const location = useLocation();
  return <p>at {location.pathname + location.search}</p>;
}

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/person/7"]}>
        <Routes>
          <Route path="/person/:publicId/:slug?" element={<Person />} />
          <Route path="/modify" element={<WhereAmI />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

function patchCalls() {
  return fetch.mock.calls.filter(([, init]) => init?.method === "PATCH");
}

beforeEach(() => {
  auth = { isAdmin: false };
  mockFetch();
});

describe("Person detail page", () => {
  it("shows the server-resolved display photo", async () => {
    renderPage();
    expect(await screen.findByAltText("Hayao Miyazaki photo")).toHaveAttribute(
      "src",
      "/static/library/totoro.jpg",
    );
  });

  it("lists the names it has on a Naming card, and no row for an unset one", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Hayao Miyazaki" });
    const naming = screen.getByText("Naming").closest("section");
    for (const label of ["English", "Chinese", "Japanese"]) {
      expect(within(naming).getByText(label)).toBeInTheDocument();
    }
    expect(within(naming).queryByText("Alternative")).not.toBeInTheDocument();
    expect(within(naming).getByText("宮崎駿")).toBeInTheDocument();
  });

  it("links the MAL person page from the Profile card", async () => {
    mockFetch({
      ...PERSON,
      mal_id: 1870,
      mal_link: "https://myanimelist.net/people/1870/Hayao_Miyazaki",
    });
    renderPage();
    expect(await screen.findByRole("link", { name: "Person #1870" })).toHaveAttribute(
      "href",
      "https://myanimelist.net/people/1870/Hayao_Miyazaki",
    );
  });

  it("links MyAnimeList beside the name when the person has a MAL link", async () => {
    const link = "https://myanimelist.net/people/1870/Hayao_Miyazaki";
    mockFetch({ ...PERSON, mal_id: 1870, mal_link: link });
    renderPage();
    const button = await screen.findByRole("link", { name: "Open on MyAnimeList" });
    expect(button).toHaveAttribute("href", link);
    expect(button).toHaveAttribute("target", "_blank");
  });

  it("draws no MyAnimeList button for a person without a MAL link", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Hayao Miyazaki" });
    expect(screen.queryByRole("link", { name: "Open on MyAnimeList" })).toBeNull();
  });

  it("names the person's types by their labels, not their keys", async () => {
    mockFetch({
      ...PERSON,
      roles: [
        { role: "director", scope: "anime-movie" },
        { role: "director", scope: "anime" },
        { role: "composer", scope: "anime" },
      ],
    });
    renderPage();
    expect(await screen.findByText("Director, Music / Composer")).toBeInTheDocument();
  });

  it("shows a guest the remark and rating as text, with no admin controls", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Hayao Miyazaki" });
    expect(screen.queryByRole("button", { name: "Quick edit" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("My rating")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Remark")).not.toBeInTheDocument();
    expect(screen.getByText("Retired, twice.")).toBeInTheDocument();
    expect(screen.getByLabelText("Rating S")).toBeInTheDocument();
  });

  describe("a seiyuu group", () => {
    const ENTRY = {
      system_id: "a1",
      public_id: 3,
      display_name: "Detective Conan",
      cover_image_file: "anime/conan.jpg",
      release_date: "1996-01-08",
    };
    const SEIYUU_GROUP = {
      media_type: "anime",
      role: "seiyuu",
      label: "Seiyuu 聲優",
      nav_path: "/anime",
      entries: [
        {
          ...ENTRY,
          casting_id: "c1",
          character_name: "Kudo Shinichi",
          character_public_id: 11,
          identity_id: "i1",
          identity_name: "Edogawa Conan",
          identity_public_id: 21,
          credited_name: null,
          character_role: "Main",
          voice_remark: "child",
          casting_remark: "flashback only",
          display_photo_file: "character-identity/conan.webp",
        },
        {
          ...ENTRY,
          casting_id: "c2",
          character_name: "Kudo Shinichi",
          character_public_id: 11,
          identity_id: null,
          identity_name: null,
          identity_public_id: null,
          credited_name: "Mysterious Boy",
          character_role: "Supporting",
          voice_remark: null,
          casting_remark: null,
          display_photo_file: "character/shinichi.webp",
        },
      ],
    };

    beforeEach(() => mockFetch(PERSON, [SEIYUU_GROUP]));

    it("leads each card with the part voiced, linked to its page", async () => {
      renderPage();
      const identity = await screen.findByRole("link", { name: "Edogawa Conan" });
      expect(identity).toHaveAttribute("href", "/identity/21/edogawa-conan");
      // A credited name leads; the character's own name sits beneath it.
      expect(screen.getByRole("link", { name: "Mysterious Boy" })).toHaveAttribute(
        "href",
        "/character/11/kudo-shinichi",
      );
      expect(screen.getByAltText("Edogawa Conan")).toHaveAttribute(
        "src",
        "/api/covers/character-identity/conan.webp?size=thumb",
      );
      expect(screen.getByText("Main")).toBeInTheDocument();
      expect(screen.getByText("(child)")).toBeInTheDocument();
    });

    it("shows the cast row's own remark beside the voice's", async () => {
      renderPage();
      const card = (await screen.findByRole("link", { name: "Edogawa Conan" })).closest(
        "[data-voiced-part]",
      );
      expect(within(card).getByText("flashback only")).toBeInTheDocument();
      expect(within(card).getByText("(child)")).toBeInTheDocument();
      // A row with no remark draws no empty line.
      expect(document.querySelectorAll("[data-cast-remark]")).toHaveLength(1);
    });

    it("names an identity's character", async () => {
      renderPage();
      const card = (await screen.findByRole("link", { name: "Edogawa Conan" })).closest(
        "[data-voiced-part]",
      );
      expect(within(card).getByText(/identity of/)).toBeInTheDocument();
      expect(within(card).getByRole("link", { name: "Kudo Shinichi" })).toHaveAttribute(
        "href",
        "/character/11/kudo-shinichi",
      );
    });

    it("keeps the entry as a secondary link on every card", async () => {
      renderPage();
      await screen.findByRole("link", { name: "Edogawa Conan" });
      // One entry, two parts in it: two cards, each linking the entry.
      const entryLinks = screen.getAllByRole("link", { name: /Detective Conan/ });
      expect(entryLinks).toHaveLength(2);
      for (const link of entryLinks) expect(link).toHaveAttribute("href", "/anime/a1");
    });
  });

  describe("as an admin", () => {
    beforeEach(() => {
      auth = { isAdmin: true };
    });

    it("links Quick edit to this person's Modify editor", async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole("button", { name: "Quick edit" }));
      expect(await screen.findByText("at /modify?id=p1&type=person")).toBeInTheDocument();
    });

    it("PATCHes my rating on change", async () => {
      const user = userEvent.setup();
      renderPage();
      await user.selectOptions(await screen.findByLabelText("My rating"), "C");
      await waitFor(() => expect(patchCalls()).toHaveLength(1));
      const [url, init] = patchCalls()[0];
      expect(url).toBe("/api/person/p1");
      expect(JSON.parse(init.body)).toEqual({ my_rating: "C" });
      expect(await screen.findByLabelText("Rating C")).toBeInTheDocument();
    });

    it("saves the remark on blur", async () => {
      const user = userEvent.setup();
      renderPage();
      const box = await screen.findByLabelText("Remark");
      await user.clear(box);
      await user.type(box, "Retired, thrice.");
      fireEvent.blur(box);
      await waitFor(() => expect(patchCalls()).toHaveLength(1));
      expect(JSON.parse(patchCalls()[0][1].body)).toEqual({ remark: "Retired, thrice." });
    });
  });
});
