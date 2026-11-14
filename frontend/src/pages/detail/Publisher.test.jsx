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

function mockFetch(publisher = PUBLISHER) {
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
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ groups: [] }) });
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

  it("shows a guest the remark as text, with no admin controls", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "木棉花" });
    expect(screen.queryByRole("button", { name: "Quick edit" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("My rating")).not.toBeInTheDocument();
    expect(screen.getByText(PUBLISHER.remark)).toBeInTheDocument();
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
      expect(screen.queryByRole("button", { name: "Quick edit" })).not.toBeInTheDocument();
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
      await screen.findByRole("button", { name: "Quick edit" });
      expect(screen.queryByLabelText("My rating")).not.toBeInTheDocument();
    });

    it("links Quick edit to this publisher's Modify editor", async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole("button", { name: "Quick edit" }));
      expect(await screen.findByText("at /modify?id=pb1&type=publisher")).toBeInTheDocument();
    });

    it("PATCHes the remark on blur", async () => {
      const user = userEvent.setup();
      renderPage();
      const box = await screen.findByLabelText("Remark");
      await user.clear(box);
      fireEvent.blur(box);
      await waitFor(() => expect(patchCalls()).toHaveLength(1));
      // An emptied remark saves as null.
      expect(JSON.parse(patchCalls()[0][1].body)).toEqual({ remark: null });
    });
  });
});
