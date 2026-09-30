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

function mockFetch(person = PERSON) {
  global.fetch = vi.fn((url, init = {}) => {
    if (init.method === "PATCH") {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ...person, ...JSON.parse(init.body) }),
      });
    }
    if (String(url).endsWith("/entries")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ groups: [] }) });
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

  it("lists all four names on a Naming card", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Hayao Miyazaki" });
    const naming = screen.getByText("Naming").closest("section");
    for (const label of ["English", "Chinese", "Japanese", "Alternative"]) {
      expect(within(naming).getByText(label)).toBeInTheDocument();
    }
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
