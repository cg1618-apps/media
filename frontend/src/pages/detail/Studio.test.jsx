import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Studio from "./Studio";
import { ToastProvider } from "../../hooks/useToast";

let auth;
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => auth }));

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
  country: "Japan",
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

function mockFetch({ studio = STUDIO, entries = ENTRIES, studioOk = true } = {}) {
  global.fetch = vi.fn((url, init = {}) => {
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
    <ToastProvider>
      <MemoryRouter initialEntries={["/studio/s1"]}>
        <Routes>
          <Route path="/studio/:publicId/:slug?" element={<Studio />} />
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

  it("renders the website link, the MAL producer link and the remark", async () => {
    renderPage();

    expect(
      await screen.findByRole("link", { name: STUDIO.website_url }),
    ).toHaveAttribute("href", STUDIO.website_url);
    expect(
      screen.getByRole("link", { name: `Producer #${STUDIO.mal_id}` }),
    ).toHaveAttribute("href", STUDIO.mal_link);
    expect(screen.getByText(STUDIO.remark)).toBeInTheDocument();
  });

  it("shows a guest the remark and rating as text, with no admin controls", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "KyoAni" });
    expect(screen.queryByRole("button", { name: "Quick edit" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("My rating")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Remark")).not.toBeInTheDocument();
    expect(screen.getByText(STUDIO.remark)).toBeInTheDocument();
  });

  describe("as an admin", () => {
    beforeEach(() => {
      auth = { isAdmin: true };
    });

    it("links Quick edit to this studio's Modify editor", async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole("button", { name: "Quick edit" }));
      expect(await screen.findByText("at /modify?id=s1&type=studio")).toBeInTheDocument();
    });

    it("PATCHes my rating on change", async () => {
      const user = userEvent.setup();
      renderPage();
      await user.selectOptions(await screen.findByLabelText("My rating"), "C");
      await waitFor(() => expect(patchCalls()).toHaveLength(1));
      const [url, init] = patchCalls()[0];
      expect(url).toBe("/api/studio/s1");
      expect(JSON.parse(init.body)).toEqual({ my_rating: "C" });
      expect(await screen.findByLabelText("Rating C")).toBeInTheDocument();
    });

    it("edits the remark in place, and saves it on blur", async () => {
      const user = userEvent.setup();
      renderPage();
      const box = await screen.findByLabelText("Remark");
      // The Profile card drops its Remark row for an admin: the editor is it.
      expect(screen.queryByText(STUDIO.remark, { selector: "div" })).not.toBeInTheDocument();
      await user.clear(box);
      await user.type(box, "Still pretty water.");
      fireEvent.blur(box);
      await waitFor(() => expect(patchCalls()).toHaveLength(1));
      expect(JSON.parse(patchCalls()[0][1].body)).toEqual({ remark: "Still pretty water." });
    });
  });
});
