import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Character from "./Character";
import { ToastProvider } from "../../hooks/useToast";

// Reassigned per test: a guest by default, an admin where a test says so.
let auth;
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => auth }));

const CHARACTER = {
  system_id: "c1",
  name_en: "Yuki Nagato",
  name_cn: null,
  name_jp: "長門有希",
  name_alt: null,
  display_name_field: "en",
  display_name: "Yuki Nagato",
  gender: "女",
  role: "Core",
  my_rating: null,
  photo_file: null,
  display_photo_file: "library/haruhi-cover.jpg",
  remark: null,
  casting_count: 2,
};

const ENTRIES = {
  groups: [
    {
      media_type: "anime",
      nav_path: "/anime",
      entries: [
        {
          system_id: "a1",
          display_name: "Haruhi Suzumiya",
          cover_image_file: null,
          release_date: "2006-04-02",
          seiyuu: [
            { display_name: "Minori Chihara", system_id: "p1", public_id: 1, remark: null },
            { display_name: "Second Voice", system_id: "p2", public_id: 2, remark: "child" },
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

function mockFetch({ character = CHARACTER, entries = ENTRIES, characterOk = true } = {}) {
  global.fetch = vi.fn((url, init = {}) => {
    if (init.method === "PATCH") {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ...character, ...JSON.parse(init.body) }),
      });
    }
    if (String(url).endsWith("/entries")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(entries) });
    }
    return Promise.resolve({
      ok: characterOk,
      status: characterOk ? 200 : 404,
      json: () => Promise.resolve(character),
    });
  });
}

function WhereAmI() {
  const location = useLocation();
  return <p>at {location.pathname + location.search}</p>;
}

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/character/c1"]}>
        <Routes>
          <Route path="/character/:publicId/:slug?" element={<Character />} />
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

describe("Character detail page", () => {
  it("heads the page with the display name", async () => {
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "Yuki Nagato" }),
    ).toBeInTheDocument();
  });

  it("groups entries by media type and names the seiyuu in each", async () => {
    renderPage();
    expect(
      await screen.findByRole("link", { name: /Haruhi Suzumiya/ }),
    ).toHaveAttribute("href", "/anime/a1");
    expect(screen.getByText("Anime")).toBeInTheDocument();
    // The seiyuu link is a genuine assertion on href, not just visible text.
    expect(screen.getByRole("link", { name: "Minori Chihara" })).toHaveAttribute(
      "href",
      "/person/1/minori-chihara",
    );
  });

  it("names every seiyuu of an entry, with the remark that tells them apart", async () => {
    renderPage();
    expect(
      await screen.findByRole("link", { name: "Second Voice (child)" }),
    ).toHaveAttribute("href", "/person/2/second-voice");
  });

  it("renders an empty group rather than hiding it when every entry is hidden", async () => {
    renderPage();
    // The manga group has zero visible entries, but the group heading and its
    // placeholder text must still render - it is not omitted.
    expect(await screen.findByText("Manga")).toBeInTheDocument();
    expect(
      screen.getByText("Nothing you can see here."),
    ).toBeInTheDocument();
  });

  it("says there are no appearances rather than rendering an empty page", async () => {
    mockFetch({ entries: { groups: [] } });
    renderPage();
    expect(await screen.findByText(/No appearances/i)).toBeInTheDocument();
  });

  it("renders the not-found state when the character is missing", async () => {
    mockFetch({ characterOk: false, character: { detail: "Character not found." } });
    renderPage();
    expect(await screen.findByText(/Character not found/i)).toBeInTheDocument();
  });

  it("shows the server-resolved display photo", async () => {
    renderPage();
    expect(await screen.findByAltText("Yuki Nagato photo")).toHaveAttribute(
      "src",
      "/static/library/haruhi-cover.jpg",
    );
  });

  it("shows the character's own role beside gender on the Profile card", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Yuki Nagato" });
    const profile = screen.getByText("Profile").closest("section");
    expect(within(profile).getByText("Role")).toBeInTheDocument();
    expect(within(profile).getByText("Core")).toBeInTheDocument();
    expect(within(profile).getByText("女")).toBeInTheDocument();
  });

  it("shows appearance and trait as chips on the Profile card, in stored order", async () => {
    mockFetch({
      character: { ...CHARACTER, appearance: ["Short Hair", "Glasses"], trait: ["Kuudere"] },
    });
    renderPage();
    await screen.findByRole("heading", { name: "Yuki Nagato" });
    const profile = screen.getByText("Profile").closest("section");
    const appearance = within(profile).getByText("Appearance").nextElementSibling;
    expect([...appearance.querySelectorAll("span span")].map((c) => c.textContent)).toEqual([
      "Short Hair",
      "Glasses",
    ]);
    expect(within(profile).getByText("Kuudere")).toBeInTheDocument();
  });

  it("reads an empty tag list as a dash, like any unset row", async () => {
    mockFetch({ character: { ...CHARACTER, appearance: [], trait: [] } });
    renderPage();
    await screen.findByRole("heading", { name: "Yuki Nagato" });
    const profile = screen.getByText("Profile").closest("section");
    expect(within(profile).getByText("Appearance").nextElementSibling).toHaveTextContent("—");
    expect(within(profile).getByText("Trait").nextElementSibling).toHaveTextContent("—");
  });

  it("links MyAnimeList beside the name when the character has a MAL link", async () => {
    const link = "https://myanimelist.net/character/251/Yuki_Nagato";
    mockFetch({ character: { ...CHARACTER, mal_link: link, mal_id: 251 } });
    renderPage();
    const button = await screen.findByRole("link", { name: "Open on MyAnimeList" });
    expect(button).toHaveAttribute("href", link);
    expect(button).toHaveAttribute("target", "_blank");
  });

  it("draws no MyAnimeList button for a character without a MAL link", async () => {
    mockFetch();
    renderPage();
    await screen.findByRole("heading", { name: "Yuki Nagato" });
    expect(screen.queryByRole("link", { name: "Open on MyAnimeList" })).toBeNull();
  });

  it("lists all four names on a Naming card", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Yuki Nagato" });
    const naming = screen.getByText("Naming").closest("section");
    for (const label of ["English", "Chinese", "Japanese", "Alternative"]) {
      expect(within(naming).getByText(label)).toBeInTheDocument();
    }
    expect(within(naming).getByText("長門有希")).toBeInTheDocument();
  });

  describe("as a guest", () => {
    it("shows no admin controls, and the remark and rating as text", async () => {
      mockFetch({ character: { ...CHARACTER, my_rating: "A", remark: "Quiet." } });
      renderPage();
      await screen.findByRole("heading", { name: "Yuki Nagato" });
      expect(screen.queryByRole("button", { name: "Quick edit" })).not.toBeInTheDocument();
      expect(screen.queryByLabelText("My rating")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Remark")).not.toBeInTheDocument();
      expect(screen.getByText("Quiet.")).toBeInTheDocument();
      expect(screen.getByLabelText("Rating A")).toBeInTheDocument();
    });
  });

  describe("as an admin", () => {
    beforeEach(() => {
      auth = { isAdmin: true };
    });

    it("links Quick edit to this character's Modify editor", async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole("button", { name: "Quick edit" }));
      expect(
        await screen.findByText("at /modify?id=c1&type=character"),
      ).toBeInTheDocument();
    });

    it("PATCHes my rating on change and shows the saved value", async () => {
      const user = userEvent.setup();
      renderPage();
      await user.selectOptions(await screen.findByLabelText("My rating"), "A+");
      await waitFor(() => expect(patchCalls()).toHaveLength(1));
      const [url, init] = patchCalls()[0];
      expect(url).toBe("/api/character/c1");
      expect(JSON.parse(init.body)).toEqual({ my_rating: "A+" });
      expect(await screen.findByLabelText("Rating A+")).toBeInTheDocument();
    });

    it("PATCHes Unrated as null", async () => {
      const user = userEvent.setup();
      mockFetch({ character: { ...CHARACTER, my_rating: "B" } });
      renderPage();
      await user.selectOptions(await screen.findByLabelText("My rating"), "");
      await waitFor(() => expect(patchCalls()).toHaveLength(1));
      expect(JSON.parse(patchCalls()[0][1].body)).toEqual({ my_rating: null });
    });

    it("saves the remark on blur, and an emptied remark as null", async () => {
      const user = userEvent.setup();
      mockFetch({ character: { ...CHARACTER, remark: "Old." } });
      renderPage();
      const box = await screen.findByLabelText("Remark");

      await user.clear(box);
      await user.type(box, "Reads a lot.");
      fireEvent.blur(box);
      await waitFor(() => expect(patchCalls()).toHaveLength(1));
      expect(JSON.parse(patchCalls()[0][1].body)).toEqual({ remark: "Reads a lot." });

      await user.clear(box);
      fireEvent.blur(box);
      await waitFor(() => expect(patchCalls()).toHaveLength(2));
      expect(JSON.parse(patchCalls()[1][1].body)).toEqual({ remark: null });
    });

    it("does not PATCH a remark left as it was", async () => {
      mockFetch({ character: { ...CHARACTER, remark: "Old." } });
      renderPage();
      fireEvent.blur(await screen.findByLabelText("Remark"));
      expect(patchCalls()).toHaveLength(0);
    });
  });
});
