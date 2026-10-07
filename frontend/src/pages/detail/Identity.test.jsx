import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Identity from "./Identity";

// Reassigned per test: a guest by default, an admin where a test says so.
let auth;
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => auth }));

const IDENTITY = {
  system_id: "i1",
  public_id: 3,
  character_id: "c1",
  character_public_id: 7,
  character_display_name: "Kudo Shinichi",
  name_en: "Edogawa Conan",
  name_cn: "江户川柯南",
  name_jp: "江戸川コナン",
  name_alt: null,
  display_name_field: "en",
  display_name: "Edogawa Conan",
  gender: null,
  display_gender: "男",
  remark: "Shrunk by APTX 4869.",
  photo_file: null,
  photo_focus: null,
  display_photo_file: "character-identity/i1.jpg",
  display_photo_focus: null,
  position: 0,
};

const ENTRIES = {
  groups: [
    {
      media_type: "anime",
      nav_path: "/anime",
      entries: [
        {
          system_id: "a1",
          casting_id: "k1",
          identity_id: "i1",
          identity_public_id: 3,
          identity_name: "Edogawa Conan",
          display_name: "Detective Conan",
          cover_image_file: null,
          release_date: "1996-01-08",
          seiyuu: [
            { display_name: "Minami Takayama", system_id: "p1", public_id: 1, remark: null },
          ],
        },
      ],
    },
    {
      media_type: "manga",
      nav_path: "/manga",
      entries: [],
    },
  ],
};

// The character the identity is of: an identity IS that character, so the
// page shows its role, tags, rating and MAL link. Its gender differs from the
// identity's on purpose, to prove which one the page shows.
const CHARACTER = {
  system_id: "c1",
  public_id: 7,
  display_name: "Kudo Shinichi",
  name_en: "Kudo Shinichi",
  name_cn: "工藤新一",
  role: "Main",
  gender: "女",
  appearance: ["Glasses", "Bow Tie"],
  trait: ["Genius"],
  mal_link: "https://myanimelist.net/character/1/Shinichi_Kudou",
  mal_id: 1,
  my_rating: "A",
  display_photo_file: "character/c1.jpg",
  display_photo_focus: null,
  identities: [
    { ...IDENTITY },
    {
      system_id: "i2",
      public_id: 4,
      character_id: "c1",
      name_en: "Conan Doyle",
      display_name: "Conan Doyle",
      display_gender: "男",
      remark: null,
      display_photo_file: null,
    },
  ],
};

function mockFetch({
  identity = IDENTITY,
  entries = ENTRIES,
  character = CHARACTER,
  identityOk = true,
  entriesOk = true,
  characterOk = true,
} = {}) {
  global.fetch = vi.fn((url) => {
    if (String(url).startsWith("/api/character/")) {
      return Promise.resolve({
        ok: characterOk,
        status: characterOk ? 200 : 500,
        json: () => Promise.resolve(character),
      });
    }
    if (String(url).endsWith("/entries")) {
      return Promise.resolve({
        ok: entriesOk,
        status: entriesOk ? 200 : 500,
        json: () => Promise.resolve(entries),
      });
    }
    return Promise.resolve({
      ok: identityOk,
      status: identityOk ? 200 : 404,
      json: () => Promise.resolve(identity),
    });
  });
}

function WhereAmI() {
  const location = useLocation();
  return <p>at {location.pathname + location.search}</p>;
}

function renderPage(path = "/identity/3") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/identity/:publicId/:slug?" element={<Identity />} />
        <Route path="/modify" element={<WhereAmI />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  auth = { isAdmin: false };
  mockFetch();
});

describe("Identity detail page", () => {
  it("heads the page with the display name", async () => {
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "Edogawa Conan" }),
    ).toBeInTheDocument();
  });

  it("fetches the detail by the URL's public_id and the entries by the system_id", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Edogawa Conan" });
    const urls = fetch.mock.calls.map(([url]) => url);
    expect(urls).toContain("/api/character-identity/3");
    expect(urls).toContain("/api/character-identity/i1/entries");
  });

  it("links the breadcrumb to the identity's character", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Edogawa Conan" });
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumbs).getByRole("link", { name: "Characters" })).toHaveAttribute(
      "href",
      "/library/character",
    );
    expect(within(crumbs).getByRole("link", { name: "Kudo Shinichi" })).toHaveAttribute(
      "href",
      "/character/7/kudo-shinichi",
    );
  });

  it("fetches the character by its public_id", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Edogawa Conan" });
    await waitFor(() =>
      expect(fetch.mock.calls.map(([url]) => url)).toContain("/api/character/7"),
    );
  });

  it("shows the character's role, tags and MAL with the identity's gender and remark", async () => {
    renderPage();
    const profile = (await screen.findByText("Profile")).closest("section");
    await waitFor(() => expect(within(profile).getByText("Main")).toBeInTheDocument());
    expect(within(profile).getByText("Glasses")).toBeInTheDocument();
    expect(within(profile).getByText("Bow Tie")).toBeInTheDocument();
    expect(within(profile).getByText("Genius")).toBeInTheDocument();
    expect(within(profile).getByRole("link", { name: "Character #1" })).toHaveAttribute(
      "href",
      CHARACTER.mal_link,
    );
    expect(within(profile).getByText("男")).toBeInTheDocument();
    expect(within(profile).queryByText("女")).toBeNull();
    expect(within(profile).getByText("Shrunk by APTX 4869.")).toBeInTheDocument();
  });

  it("links the character's MyAnimeList page beside the name", async () => {
    renderPage();
    expect(await screen.findByRole("link", { name: "Open on MyAnimeList" })).toHaveAttribute(
      "href",
      CHARACTER.mal_link,
    );
  });

  it("stamps the character's rating on the photo, read-only", async () => {
    renderPage();
    expect(await screen.findByLabelText("Rating A")).toBeInTheDocument();
    expect(screen.queryByLabelText("My rating")).toBeNull();
  });

  it("lists the character and its other identities, not this one, in a Character section", async () => {
    renderPage();
    const section = (await screen.findByRole("heading", { name: /^Character/ })).closest("section");
    await waitFor(() =>
      expect(within(section).getByRole("link", { name: /Kudo Shinichi/ })).toHaveAttribute(
        "href",
        "/character/7/kudo-shinichi",
      ),
    );
    expect(within(section).getByRole("link", { name: /Conan Doyle/ })).toHaveAttribute(
      "href",
      "/identity/4/conan-doyle",
    );
    expect(within(section).queryByRole("link", { name: /Edogawa Conan/ })).toBeNull();
    expect(within(section).getAllByRole("link")).toHaveLength(2);
  });

  it("still renders the identity when the character fails to load", async () => {
    mockFetch({ characterOk: false });
    renderPage();
    expect(await screen.findByRole("heading", { name: "Edogawa Conan" })).toBeInTheDocument();
    const profile = screen.getByText("Profile").closest("section");
    expect(within(profile).getByText("男")).toBeInTheDocument();
    expect(within(profile).getByText("Shrunk by APTX 4869.")).toBeInTheDocument();
    // The character card still links, from what the identity itself carries.
    const section = screen.getByRole("heading", { name: /^Character/ }).closest("section");
    expect(within(section).getByRole("link", { name: /Kudo Shinichi/ })).toHaveAttribute(
      "href",
      "/character/7/kudo-shinichi",
    );
    expect(screen.queryByRole("link", { name: "Open on MyAnimeList" })).toBeNull();
  });

  it("lists all four names on a Naming card", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Edogawa Conan" });
    const naming = screen.getByText("Naming").closest("section");
    for (const label of ["English", "Chinese", "Japanese", "Alternative"]) {
      expect(within(naming).getByText(label)).toBeInTheDocument();
    }
    expect(within(naming).getByText("江戸川コナン")).toBeInTheDocument();
  });

  it("shows the server-resolved display photo", async () => {
    renderPage();
    expect(await screen.findByAltText("Edogawa Conan photo")).toHaveAttribute(
      "src",
      "/api/covers/character-identity/i1.jpg",
    );
  });

  it("groups appearances by media type and names the seiyuu in each", async () => {
    renderPage();
    expect(
      await screen.findByRole("link", { name: /Detective Conan/ }),
    ).toHaveAttribute("href", "/anime/a1");
    expect(screen.getByText("Anime")).toBeInTheDocument();
    expect(screen.getByText("Manga")).toBeInTheDocument();
    expect(screen.getByText("Nothing you can see here.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Minami Takayama" })).toHaveAttribute(
      "href",
      "/person/1/minami-takayama",
    );
    expect(screen.getByText("1 appearance")).toBeInTheDocument();
  });

  it("does not repeat the identity under each appearance", async () => {
    renderPage();
    await screen.findByRole("link", { name: /Detective Conan/ });
    expect(screen.queryByText("as Edogawa Conan")).toBeNull();
  });

  it("renders the not-found state when the identity is missing", async () => {
    mockFetch({ identityOk: false, identity: { detail: "Identity not found." } });
    renderPage();
    expect(await screen.findByText("Error Loading Identity")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("still renders the profile when the entries fail to load", async () => {
    mockFetch({ entriesOk: false });
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "Edogawa Conan" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/No appearances/i)).toBeInTheDocument();
  });

  it("shows no admin toolbar to a guest", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Edogawa Conan" });
    expect(screen.queryByRole("button", { name: "Quick edit" })).not.toBeInTheDocument();
  });

  it("links Quick edit to this identity's Modify editor for an admin", async () => {
    auth = { isAdmin: true };
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Quick edit" }));
    expect(
      await screen.findByText("at /modify?id=i1&type=identity"),
    ).toBeInTheDocument();
  });
});
