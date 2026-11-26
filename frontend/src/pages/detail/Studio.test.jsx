import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Studio from "./Studio";
import { ToastProvider } from "../../hooks/useToast";

let auth;
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => auth }));
// The remark list, resources and personal notes are NotesTemplate's to test; here only
// that the page hands it this record as the owner.
vi.mock("../notes/NotesTemplate", () => ({
  default: ({ ownerType, ownerId }) => (
    <div data-testid="entity-notes" data-owner-type={ownerType} data-owner-id={ownerId} />
  ),
}));
// Toasts are recorded rather than rendered: ToastProvider draws nothing.
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock("../../hooks/useToast", () => ({
  ToastProvider: ({ children }) => children,
  useToast: () => toast,
}));

const STUDIO = {
  system_id: "s1",
  name_en: "Kyoto Animation",
  name_cn: "京都動畫",
  name_jp: "京都アニメーション",
  name_alt: "KyoAni",
  display_name_field: "alt",
  display_name: "KyoAni",
  my_rating: "A",
  logo_file: null,
  remark: "The one with the pretty water.",
  founded_date: "1981-11-12",
  defunct_date: null,
  countries: ["Japan", "China"],
  website_url: "https://www.kyotoanimation.co.jp/",
  mal_id: 2,
  mal_link: "https://myanimelist.net/anime/producer/2",
  credit_count: 2,
};

const ENTRIES = {
  groups: [
    {
      media_type: "anime",
      label: "Anime",
      nav_path: "/anime",
      entries: [
        {
          system_id: "a1",
          display_name: "Violet Evergarden",
          cover_image_file: null,
          release_date: "2018-01-11",
        },
        {
          system_id: "a2",
          display_name: "Hyouka",
          cover_image_file: null,
          release_date: "2012-04-23",
        },
      ],
    },
  ],
};

function mockFetch({ studio = STUDIO, entries = ENTRIES, studioOk = true, related = [] } = {}) {
  global.fetch = vi.fn((url, init = {}) => {
    if (init.method === "PUT") {
      const body = JSON.parse(init.body);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            owner_type: "studio",
            owner_id: "s1",
            my_rating: body.my_rating ?? null,
            expectation: null,
          }),
      });
    }
    if (init.method === "PATCH") {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ...studio, ...JSON.parse(init.body) }),
      });
    }
    if (String(url).endsWith("/entries")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(entries) });
    }
    if (String(url).endsWith("/related")) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(related) });
    }
    return Promise.resolve({
      ok: studioOk,
      status: studioOk ? 200 : 404,
      json: () => Promise.resolve(studio),
    });
  });
}

function WhereAmI() {
  const location = useLocation();
  return <p>at {location.pathname + location.search}</p>;
}

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
    <ToastProvider>
      <MemoryRouter initialEntries={["/studio/s1"]}>
        <Routes>
          <Route path="/studio/:publicId/:slug?" element={<Studio />} />
          <Route path="/modify" element={<WhereAmI />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
    </QueryClientProvider>,
  );
}

function patchCalls() {
  return fetch.mock.calls.filter(([, init]) => init?.method === "PATCH");
}

function putCalls() {
  return fetch.mock.calls.filter(([, init]) => init?.method === "PUT");
}

beforeEach(() => {
  auth = { isAdmin: false, has: () => false };
  mockFetch();
});

describe("Studio detail page", () => {
  it("heads the page with the display name and lists all four names on a Naming card", async () => {
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "KyoAni" }),
    ).toBeInTheDocument();
    const naming = screen.getByText("Naming").closest("section");
    for (const label of ["English", "Chinese", "Japanese", "Alternative"]) {
      expect(within(naming).getByText(label)).toBeInTheDocument();
    }
    // The displayed name is listed too, as on the person and character pages.
    expect(within(naming).getByText("KyoAni")).toBeInTheDocument();
    expect(within(naming).getByText("京都アニメーション")).toBeInTheDocument();
  });

  it("lists every country the studio names, in order", async () => {
    renderPage();
    expect(await screen.findByText("Japan, China")).toBeInTheDocument();
    expect(screen.getByText("Countries")).toBeInTheDocument();
  });

  it("shows the content rating in the profile", async () => {
    mockFetch({ studio: { ...STUDIO, content_rating: "borderline" } });
    renderPage();
    const profile = (await screen.findByText("Profile")).closest("section");
    expect(within(profile).getByText("Content rating")).toBeInTheDocument();
    expect(within(profile).getByText("Borderline (15+)")).toBeInTheDocument();
  });

  it("reads an unset content rating as Normal", async () => {
    renderPage();
    const profile = (await screen.findByText("Profile")).closest("section");
    expect(within(profile).getByText("Normal")).toBeInTheDocument();
  });

  it("shows the founding date without inventing a defunct one", async () => {
    renderPage();
    expect(await screen.findByText("Since 1981-11-12")).toBeInTheDocument();
  });

  it("closes the span when the studio is defunct", async () => {
    mockFetch({ studio: { ...STUDIO, defunct_date: "2019" } });
    renderPage();
    expect(await screen.findByText("1981-11-12 – 2019")).toBeInTheDocument();
  });

  it("links every credited entry to its own detail page", async () => {
    renderPage();
    expect(
      await screen.findByRole("link", { name: /Violet Evergarden/ }),
    ).toHaveAttribute("href", "/anime/a1");
    expect(screen.getByRole("link", { name: /Hyouka/ })).toHaveAttribute(
      "href",
      "/anime/a2",
    );
    expect(screen.getByText("Anime")).toBeInTheDocument();
  });

  it("says there are no credited entries rather than rendering an empty page", async () => {
    mockFetch({ entries: { groups: [] } });
    renderPage();
    expect(await screen.findByText(/No credited entries/i)).toBeInTheDocument();
  });

  it("renders the not-found state when the studio is missing", async () => {
    mockFetch({ studioOk: false, studio: { detail: "Studio not found." } });
    renderPage();
    expect(await screen.findByText(/Studio not found/i)).toBeInTheDocument();
  });

  it("renders an until-date when only the defunct date is on record", async () => {
    mockFetch({ studio: { ...STUDIO, founded_date: null, defunct_date: "2019" } });
    renderPage();
    expect(await screen.findByText("Until 2019")).toBeInTheDocument();
  });

  it("leaves Active blank rather than inventing a span when both dates are empty", async () => {
    mockFetch({
      studio: { ...STUDIO, founded_date: null, defunct_date: null },
    });
    renderPage();

    await screen.findByRole("heading", { name: "KyoAni" });
    // InfoRow keeps the row and shows an em dash for an absent value, so the
    // check is that no span text was fabricated - not that the row is gone.
    expect(screen.queryByText(/^Since /)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Until /)).not.toBeInTheDocument();
    expect(screen.queryByText(/–/)).not.toBeInTheDocument();
  });

  it("lists the website, MAL and AniList in the links card, and not in the profile", async () => {
    mockFetch({ studio: { ...STUDIO, anilist_link: "https://anilist.co/studio/2" } });
    renderPage();
    const links = await screen.findByRole("region", { name: "Links" });
    expect(within(links).getByRole("link", { name: "MyAnimeList" })).toHaveAttribute(
      "href",
      STUDIO.mal_link,
    );
    expect(within(links).getByRole("link", { name: "AniList" })).toHaveAttribute(
      "href",
      "https://anilist.co/studio/2",
    );
    expect(within(links).getByRole("link", { name: "Website" })).toHaveAttribute(
      "href",
      STUDIO.website_url,
    );
    const profile = screen.getByText("Profile").closest("section");
    expect(within(profile).queryByRole("link")).toBeNull();
  });

  it("draws no link buttons beside the name", async () => {
    renderPage();
    await screen.findByRole("heading", { name: STUDIO.display_name });
    expect(screen.queryByRole("link", { name: "Open on MyAnimeList" })).toBeNull();
  });

  it("sets the credited-entry count on the kind line above the name", async () => {
    renderPage();
    const heading = await screen.findByRole("heading", { level: 1, name: "KyoAni" });
    const count = screen.getByText("2 credited entries");
    expect(count.parentElement).toHaveTextContent(/^Studio/);
    expect(
      count.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("puts Related companies in the left column, under the links card", async () => {
    mockFetch({
      related: [{ kind: "publisher", system_id: "p9", display_name: "Kadokawa", remark: null }],
    });
    renderPage();
    const links = await screen.findByRole("region", { name: "Links" });
    const related = await screen.findByText("Related companies");
    expect(links.parentElement).toContainElement(related);
    expect(
      links.compareDocumentPosition(related) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("draws a credit as its library card without the tracker", async () => {
    mockFetch({
      entries: {
        groups: [
          {
            ...ENTRIES.groups[0],
            entries: [
              {
                ...ENTRIES.groups[0].entries[0],
                airing_type: "TV",
                release_season: "Winter",
                release_date_jp: "2018-01-11",
                mal_rating: 8.7,
                my_rating: "S",
              },
            ],
          },
        ],
      },
    });
    renderPage();
    expect(await screen.findByText("Winter 2018")).toBeInTheDocument();
    expect(screen.getByText("TV")).toBeInTheDocument();
    expect(screen.getByTitle("MAL score")).toHaveTextContent("8.7");
    expect(screen.getByLabelText("Rating S")).toBeInTheDocument();
  });

  it("sorts the credits newest first, and old to new when reversed", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("link", { name: /Violet Evergarden/ });
    const titles = () =>
      screen
        .getAllByRole("link", { name: /Violet Evergarden|Hyouka/ })
        .map((a) => a.textContent);
    expect(titles()).toEqual(["Violet Evergarden", "Hyouka"]);
    await user.click(screen.getByRole("button", { name: "Reverse order" }));
    expect(titles()).toEqual(["Hyouka", "Violet Evergarden"]);
  });

  it("sorts the credits by the public rating", async () => {
    const user = userEvent.setup();
    mockFetch({
      entries: {
        groups: [
          {
            ...ENTRIES.groups[0],
            entries: [
              { ...ENTRIES.groups[0].entries[0], mal_rating: 8.1 },
              { ...ENTRIES.groups[0].entries[1], mal_rating: 8.9 },
            ],
          },
        ],
      },
    });
    renderPage();
    await screen.findByRole("link", { name: /Violet Evergarden/ });
    await user.selectOptions(screen.getByRole("combobox", { name: "Sort" }), "public_rating");
    expect(
      screen
        .getAllByRole("link", { name: /Violet Evergarden|Hyouka/ })
        .map((a) => a.textContent),
    ).toEqual(["Hyouka", "Violet Evergarden"]);
  });

  // The remark list, resources and personal notes are this studio's notes block.
  it("draws the remark list, resources and personal notes for this studio", async () => {
    renderPage();
    const notes = await screen.findByTestId("entity-notes");
    expect(notes).toHaveAttribute("data-owner-type", "studio");
    expect(notes.getAttribute("data-owner-id")).toBeTruthy();
  });

  it("shows a guest no admin controls", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "KyoAni" });
    expect(screen.queryByRole("button", { name: "Edit this studio" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("My rating")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Remark")).not.toBeInTheDocument();
  });

  describe("as a member holding self.list", () => {
    // The guest test renders the same studio; only the permission differs, so
    // the select's presence here is self.list's doing.
    beforeEach(() => {
      auth = { isAdmin: false, has: (p) => p === "self.list" };
    });

    it("edits its own rating, with no admin controls", async () => {
      const user = userEvent.setup();
      renderPage();
      await user.selectOptions(await screen.findByLabelText("My rating"), "C");
      await waitFor(() => expect(putCalls()).toHaveLength(1));
      expect(putCalls()[0][0]).toBe("/api/me/ratings/studio/s1");
      expect(screen.queryByRole("button", { name: "Edit this studio" })).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Remark")).not.toBeInTheDocument();
    });

    it("saves my rating as its own, through /api/me/ratings", async () => {
      const user = userEvent.setup();
      renderPage();
      await user.selectOptions(await screen.findByLabelText("My rating"), "C");
      await waitFor(() => expect(putCalls()).toHaveLength(1));
      const [url, init] = putCalls()[0];
      expect(url).toBe("/api/me/ratings/studio/s1");
      expect(JSON.parse(init.body)).toEqual({ my_rating: "C" });
      expect(patchCalls()).toHaveLength(0);
      expect(await screen.findByLabelText("Rating C")).toBeInTheDocument();
    });
  });

  describe("as an admin", () => {
    // Root holds every key but the self.* family, as AuthContext's has() does:
    // an admin keeps no personal data, so it has no rating of its own.
    beforeEach(() => {
      auth = { isAdmin: true, has: (p) => !p.startsWith("self.") };
    });

    it("draws no rating editor", async () => {
      renderPage();
      await screen.findByRole("button", { name: "Edit this studio" });
      expect(screen.queryByLabelText("My rating")).not.toBeInTheDocument();
    });

    it("puts Edit and Autofill at the left of the admin strip, with no Admin caption", async () => {
      renderPage();
      const edit = await screen.findByRole("button", { name: "Edit this studio" });
      const group = screen.getByRole("group", { name: "Edit actions" });
      expect(group).toContainElement(edit);
      expect(group).toContainElement(screen.getByRole("button", { name: "Autofill & update" }));
      expect(group.parentElement.textContent).not.toMatch(/admin/i);
    });

    it("links Edit to this studio's Modify editor", async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole("button", { name: "Edit this studio" }));
      expect(await screen.findByText("at /modify?id=s1&type=studio")).toBeInTheDocument();
    });


  });
});

describe("Studio Autofill & update", () => {
  const ADMIN = { isAdmin: true, has: (p) => !p.startsWith("self.") };

  function autofillCalls() {
    return fetch.mock.calls.filter(
      ([url, init]) => init?.method === "POST" && String(url).endsWith("/autofill"),
    );
  }

  it("is not offered to a viewer who cannot edit the catalogue", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "KyoAni" });
    expect(screen.queryByRole("button", { name: /Autofill/ })).not.toBeInTheDocument();
  });

  it("is not offered for a studio with no MAL link", async () => {
    auth = ADMIN;
    mockFetch({ studio: { ...STUDIO, mal_id: null, mal_link: null } });
    renderPage();
    await screen.findByRole("button", { name: "Edit this studio" });
    expect(screen.queryByRole("button", { name: /Autofill/ })).not.toBeInTheDocument();
  });

  it("fills from MAL and shows what came back", async () => {
    auth = ADMIN;
    const user = userEvent.setup();
    renderPage();
    const button = await screen.findByRole("button", { name: "Autofill & update" });
    mockFetch({ studio: { ...STUDIO, display_name: "Kyoto Animation Co." } });
    await user.click(button);

    await waitFor(() => expect(autofillCalls()).toHaveLength(1));
    expect(autofillCalls()[0][0]).toBe("/api/studio/s1/autofill");
    expect(
      await screen.findByRole("heading", { name: "Kyoto Animation Co." }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(toast.showToast).toHaveBeenCalledWith("success", "Autofill completed"),
    );
  });
});

describe("Studio detail page logo", () => {
  it("shows the server-resolved display logo with its focus", async () => {
    mockFetch({
      studio: {
        ...STUDIO,
        display_logo_file: "library/violet.jpg",
        display_logo_focus: "30% 40%",
      },
    });
    renderPage();
    const img = await screen.findByAltText("KyoAni logo");
    expect(img).toHaveAttribute("src", "/static/library/violet.jpg");
    expect(img.style.objectPosition).toBe("30% 40%");
  });

  it("falls back to logo_file for a payload without display_logo", async () => {
    mockFetch({
      studio: { ...STUDIO, logo_file: "library/own.png", logo_focus: "10% 20%" },
    });
    renderPage();
    const img = await screen.findByAltText("KyoAni logo");
    expect(img).toHaveAttribute("src", "/static/library/own.png");
    expect(img.style.objectPosition).toBe("10% 20%");
  });
});
