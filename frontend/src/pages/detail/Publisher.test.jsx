// Publisher detail page: the Naming card, the Types row (the media types it
// is offered on), and the admin controls it shares with Person.jsx.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Publisher from "./Publisher";
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

const PUBLISHER = {
  system_id: "pb1",
  public_id: 3,
  name_en: "Muse Communication",
  name_cn: "木棉花",
  name_jp: "ミューズ・コミュニケーション",
  name_alt: null,
  display_name_field: "cn",
  display_name: "木棉花",
  my_rating: "A",
  logo_file: null,
  remark: "Taiwan's anime distributor.",
  founded_date: "1992",
  defunct_date: null,
  country: "Taiwan",
  website_url: null,
  scopes: ["anime", "anime-movie"],
  credit_count: 0,
};

function mockFetch(publisher = PUBLISHER, entries = { groups: [] }) {
  global.fetch = vi.fn((url, init = {}) => {
    if (init.method === "PUT") {
      const body = JSON.parse(init.body);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            owner_type: "publisher",
            owner_id: "pb1",
            my_rating: body.my_rating ?? null,
            expectation: null,
          }),
      });
    }
    if (init.method === "PATCH") {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ...publisher, ...JSON.parse(init.body) }),
      });
    }
    if (String(url).endsWith("/entries")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(entries) });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(publisher) });
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
      <MemoryRouter initialEntries={["/publisher/3"]}>
        <Routes>
          <Route path="/publisher/:publicId/:slug?" element={<Publisher />} />
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

describe("Publisher detail page", () => {
  it("lists the names it has on a Naming card, the displayed one included", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "木棉花" });
    const naming = screen.getByText("Naming").closest("section");
    for (const label of ["English", "Chinese", "Japanese"]) {
      expect(within(naming).getByText(label)).toBeInTheDocument();
    }
    expect(within(naming).queryByText("Alternative")).not.toBeInTheDocument();
    expect(within(naming).getByText("木棉花")).toBeInTheDocument();
    expect(within(naming).getByText("Muse Communication")).toBeInTheDocument();
  });

  it("names the media types it is offered on", async () => {
    renderPage();
    const profile = (await screen.findByText("Profile")).closest("section");
    expect(within(profile).getByText("Types")).toBeInTheDocument();
    expect(within(profile).getByText("Anime, Anime Movie")).toBeInTheDocument();
    // A publisher has no MAL record, so there is no MAL row.
    expect(within(profile).queryByText("MAL")).not.toBeInTheDocument();
  });

  it("sets the profile on one row: country, types, active, content rating", async () => {
    renderPage();
    const profile = (await screen.findByText("Profile")).closest("section");
    // Every field sits on the one row, in this order.
    const row = within(profile).getByText("Country").closest(".grid");
    expect([...row.children].map((field) => field.firstChild.textContent)).toEqual([
      "Country",
      "Types",
      "Active",
      "Content rating",
    ]);
    expect(row.parentElement.children).toHaveLength(1);
    expect(row).toHaveTextContent("Since 1992");
  });

  it("shows the content rating in the profile", async () => {
    mockFetch({ ...PUBLISHER, content_rating: "borderline" });
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

  it("lists the website in the links card, not in the profile", async () => {
    mockFetch({ ...PUBLISHER, website_url: "https://www.e-muse.com.tw/" });
    renderPage();
    const links = await screen.findByRole("region", { name: "Links" });
    expect(within(links).getByRole("link", { name: "Website" })).toHaveAttribute(
      "href",
      "https://www.e-muse.com.tw/",
    );
    const profile = screen.getByText("Profile").closest("section");
    expect(within(profile).queryByText("Website")).toBeNull();
  });

  it("sets the credited-entry count on the kind line above the name", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 1, name: "木棉花" });
    expect(screen.getByText("0 credited entries").parentElement).toHaveTextContent(
      /^Publisher/,
    );
  });

  it("draws a manga credit with its release date and MAL score", async () => {
    mockFetch(PUBLISHER, {
      groups: [
        {
          media_type: "manga",
          label: "Manga",
          nav_path: "/manga",
          entries: [
            {
              system_id: "m1",
              display_name: "Frieren",
              release_date: "2020-04-28",
              mal_rating: 9.1,
            },
          ],
        },
      ],
    });
    renderPage();
    expect(await screen.findByRole("link", { name: "Frieren" })).toHaveAttribute(
      "href",
      "/manga/m1",
    );
    expect(screen.getByText("2020-04-28")).toBeInTheDocument();
    expect(screen.getByTitle("MAL score")).toHaveTextContent("9.1");
  });

  // The remark list, resources and personal notes are this publisher's notes block.
  it("draws the remark list, resources and personal notes for this publisher", async () => {
    renderPage();
    const notes = await screen.findByTestId("entity-notes");
    expect(notes).toHaveAttribute("data-owner-type", "publisher");
    expect(notes.getAttribute("data-owner-id")).toBeTruthy();
  });

  it("shows a guest no admin controls", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "木棉花" });
    expect(screen.queryByRole("button", { name: "Edit this publisher" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("My rating")).not.toBeInTheDocument();
  });

  describe("as a member holding self.list", () => {
    // The guest test renders the same publisher; only the permission differs, so
    // the select's presence here is self.list's doing.
    beforeEach(() => {
      auth = { isAdmin: false, has: (p) => p === "self.list" };
    });

    it("edits its own rating, with no admin controls", async () => {
      const user = userEvent.setup();
      renderPage();
      await user.selectOptions(await screen.findByLabelText("My rating"), "B");
      await waitFor(() => expect(putCalls()).toHaveLength(1));
      expect(putCalls()[0][0]).toBe("/api/me/ratings/publisher/pb1");
      expect(JSON.parse(putCalls()[0][1].body)).toEqual({ my_rating: "B" });
      expect(patchCalls()).toHaveLength(0);
      expect(screen.queryByRole("button", { name: "Edit this publisher" })).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Remark")).not.toBeInTheDocument();
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
      await screen.findByRole("button", { name: "Edit this publisher" });
      expect(screen.queryByLabelText("My rating")).not.toBeInTheDocument();
    });

    it("links Edit to this publisher's Modify editor", async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole("button", { name: "Edit this publisher" }));
      expect(await screen.findByText("at /modify?id=pb1&type=publisher")).toBeInTheDocument();
    });

  });
});

describe("Publisher detail page logo", () => {
  it("shows the server-resolved display logo with its focus", async () => {
    mockFetch({
      ...PUBLISHER,
      display_logo_file: "library/cover.jpg",
      display_logo_focus: "30% 40%",
    });
    renderPage();
    const img = await screen.findByAltText("木棉花 logo");
    expect(img).toHaveAttribute("src", "/static/library/cover.jpg");
    expect(img.style.objectPosition).toBe("30% 40%");
  });

  it("falls back to logo_file for a payload without display_logo", async () => {
    mockFetch({ ...PUBLISHER, logo_file: "library/own.png", logo_focus: "10% 20%" });
    renderPage();
    const img = await screen.findByAltText("木棉花 logo");
    expect(img).toHaveAttribute("src", "/static/library/own.png");
    expect(img.style.objectPosition).toBe("10% 20%");
  });
});
