// Frontend: the franchise hub's media tab counts.
//
// Every media tab carries the number of entries it lists. A tab whose label
// had no count showed "Game 0" beside a full list of games.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FranchisePage from "./FranchisePage";
import { ToastProvider } from "../../hooks/useToast";
import { AuthProvider } from "../../contexts/AuthContext";

// The canvas needs a real layout engine, and the Relations tab is tested here
// only for the link above it.
vi.mock("../../components/relations/RelationGraph", () => ({
  default: () => null,
}));

const FRANCHISE = {
  system_id: "FR001",
  franchise_name_en: "Elden Ring",
  franchise_type: "Game",
};

const GAMES = [
  {
    system_id: "GM001",
    game_name_en: "Elden Ring",
    game_type: "Base Game",
    playing_status: "Completed",
  },
  {
    system_id: "GM002",
    game_name_en: "Shadow of the Erdtree",
    game_type: "DLC",
    playing_status: "Plan to Play",
  },
];

const H_GAMES = [
  {
    system_id: "HG001",
    h_game_name_en: "Doujin Game",
    playing_status: "Plan to Play",
  },
];

function jsonRes(body) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

let franchise = FRANCHISE;
let me = [];

beforeEach(() => {
  franchise = FRANCHISE;
  me = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url, init = {}) => {
      const u = String(url);
      if (u.startsWith("/api/auth/me")) return jsonRes(me);
      if (init.method === "PUT" && u.startsWith("/api/me/ratings/")) {
        const body = JSON.parse(init.body);
        return jsonRes({
          owner_type: "franchise",
          owner_id: "FR001",
          my_rating: body.my_rating ?? franchise.my_rating ?? null,
          expectation: body.expectation ?? franchise.franchise_expectation ?? null,
        });
      }
      if (init.method === "PUT" && u.startsWith("/api/me/remarks/")) {
        return jsonRes({ remark: JSON.parse(init.body).remark });
      }
      if (u.startsWith("/api/franchise/FR001")) return jsonRes(franchise);
      if (u.startsWith("/api/game/")) return jsonRes(GAMES);
      if (u.startsWith("/api/h-game/")) return jsonRes(H_GAMES);
      return jsonRes([]);
    }),
  );
});

const hGameFetched = () =>
  fetch.mock.calls.some(([url]) => String(url).startsWith("/api/h-game/"));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/franchise/FR001"]}>
        <AuthProvider>
          <ToastProvider>
            <Routes>
              <Route
                path="/franchise/:publicId/:slug?"
                element={<FranchisePage />}
              />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("FranchisePage tab counts", () => {
  it("counts the Game tab", async () => {
    renderPage();
    expect(
      await screen.findByRole("button", { name: /^Game\s*2$/ }),
    ).toBeInTheDocument();
  });
});

// The header's entry total and completion are taken over every listed tab,
// each type judged by its own status field.
describe("FranchisePage header totals", () => {
  it("counts the games and their completion", async () => {
    renderPage();
    expect(
      await screen.findByText(/2 entries\s+·\s+50% completed/),
    ).toBeInTheDocument();
  });
});

// The restricted family: an h-game may sit in a franchise of any of its three
// types, so a franchise typed H-Comic or Hentai asks for its h-games too, and
// a mainstream franchise never does.
describe("FranchisePage restricted family", () => {
  it.each(["H-Comic", "Hentai", "H-Game", "H-Comic, Hentai, H-Game"])(
    "lists the h-games of a %s franchise",
    async (franchiseType) => {
      franchise = { ...FRANCHISE, franchise_type: franchiseType };
      renderPage();
      expect(
        await screen.findByRole("button", { name: /^H-Game\s*1$/ }),
      ).toBeInTheDocument();
      expect(hGameFetched()).toBe(true);
    },
  );

  it("does not ask a mainstream franchise for h-games", async () => {
    renderPage();
    await screen.findByRole("button", { name: /^Game\s*2$/ });
    expect(hGameFetched()).toBe(false);
    expect(screen.queryByRole("button", { name: /^H-Game/ })).toBeNull();
  });
});

// The hub's graph is read-only; an admin reaches the editor through a link
// already scoped to this franchise, which /relations reads from ?owner=.
describe("FranchisePage relations link", () => {
  it("links a catalogue editor to /relations scoped to this franchise", async () => {
    // Super: is_admin is manage.catalog, which the admin role does not hold.
    me = { is_admin: true, username: "cg1618", role: "super", permissions: ["manage.catalog"] };
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Relations" }));
    expect(
      (await screen.findByRole("link", { name: "Edit relations" })).getAttribute("href"),
    ).toBe("/relations?owner=franchise:FR001");
  });

  it("draws no link for a guest", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Relations" }));
    expect(screen.queryByRole("link", { name: "Edit relations" })).toBeNull();
  });
});

// A guest's hub: the franchise carries a rating and an expectation, and the
// member mirror draws both and offers the Characters tab, so their absence
// for a guest is the permissions' doing - self.list for the viewer's own
// rating and expectation, view.character for the Characters tab.
describe("FranchisePage for a guest", () => {
  const GUEST = { username: null, role: "guest", permissions: [] };
  const MEMBER = {
    username: "reader",
    role: "user",
    permissions: ["view.studio", "view.publisher", "view.person", "view.character", "view.search", "view.random_picker", "self.list"],
  };
  // The member without self.list: every view.* key, the same franchise.
  const READER = { ...MEMBER, permissions: MEMBER.permissions.filter((p) => p !== "self.list") };
  const ratingSelect = () => screen.queryByRole("option", { name: "Not rated" })?.closest("select");
  const putCalls = () => fetch.mock.calls.filter(([, init]) => init?.method === "PUT");
  const rated = { ...FRANCHISE, my_rating: "S", franchise_expectation: "High" };
  const characterFetched = () =>
    fetch.mock.calls.some(([url]) => String(url).startsWith("/api/character/"));

  it("draws no rating, no expectation and no Characters tab", async () => {
    franchise = rated;
    me = GUEST;
    renderPage();
    expect(await screen.findByRole("button", { name: /^Game\s*2$/ })).toBeInTheDocument();
    expect(screen.queryByLabelText("Rating S")).toBeNull();
    expect(screen.queryByText(/Expectation · High/)).toBeNull();
    expect(screen.queryByRole("button", { name: /^Characters/ })).toBeNull();
    expect(characterFetched()).toBe(false);
  });

  it("draws all three for a member", async () => {
    franchise = rated;
    me = MEMBER;
    renderPage();
    expect(await screen.findByRole("button", { name: /^Characters/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Rating S")).toBeInTheDocument();
    expect(screen.getByText(/Expectation · High/)).toBeInTheDocument();
  });

  it("lets a member holding self.list save its own rating and expectation", async () => {
    franchise = rated;
    me = MEMBER;
    renderPage();
    await screen.findByRole("button", { name: /^Characters/ });
    // The plan controls stay the catalogue manager's.
    expect(screen.queryByText("Plan next")).toBeNull();

    await userEvent.selectOptions(ratingSelect(), "A");
    await waitFor(() => expect(putCalls()).toHaveLength(1));
    expect(putCalls()[0][0]).toBe("/api/me/ratings/franchise/FR001");
    expect(JSON.parse(putCalls()[0][1].body)).toEqual({ my_rating: "A" });
    expect(await screen.findByLabelText("Rating A")).toBeInTheDocument();

    const expectationSelect = screen.getByRole("option", { name: "None" }).closest("select");
    await userEvent.selectOptions(expectationSelect, "");
    await waitFor(() => expect(putCalls()).toHaveLength(2));
    expect(JSON.parse(putCalls()[1][1].body)).toEqual({ expectation: null });
  });

  it("offers no editor, and draws no rating, without self.list", async () => {
    franchise = rated;
    me = READER;
    renderPage();
    expect(await screen.findByRole("button", { name: /^Characters/ })).toBeInTheDocument();
    expect(ratingSelect()).toBeFalsy();
    expect(screen.queryByLabelText("Rating S")).toBeNull();
    expect(screen.queryByText(/Expectation · High/)).toBeNull();
  });
});

// The hero remark is the viewer's own: a holder of self.list writes it through
// /api/me/remarks, never the catalogue's PATCH. The franchise carries a remark
// in both cases, so the box's absence without self.list is the permission's
// doing and not an empty row's.
describe("FranchisePage own remark", () => {
  const LISTER = { username: "reader", role: "user", is_admin: false, permissions: ["self.list"] };
  const NO_LIST = { ...LISTER, permissions: [] };
  const remarked = { ...FRANCHISE, remark: "Watch the films first." };
  const remarkBox = () => screen.queryByPlaceholderText(/Private overview notes/);
  const putCalls = () =>
    fetch.mock.calls.filter(
      ([url, init]) => init?.method === "PUT" && String(url).startsWith("/api/me/remarks/"),
    );
  const patchCalls = () => fetch.mock.calls.filter(([, init]) => init?.method === "PATCH");

  it("lets a holder of self.list edit it, saved through /api/me/remarks", async () => {
    franchise = remarked;
    me = LISTER;
    renderPage();
    const box = await screen.findByPlaceholderText(/Private overview notes/);
    expect(box).toHaveValue("Watch the films first.");
    expect(box).toBeEnabled();

    await userEvent.clear(box);
    await userEvent.type(box, "Start with the games.");
    fireEvent.blur(box);
    await waitFor(() => expect(putCalls()).toHaveLength(1));
    expect(putCalls()[0][0]).toBe("/api/me/remarks/franchise/FR001");
    expect(JSON.parse(putCalls()[0][1].body)).toEqual({ remark: "Start with the games." });

    await userEvent.clear(box);
    fireEvent.blur(box);
    await waitFor(() => expect(putCalls()).toHaveLength(2));
    expect(JSON.parse(putCalls()[1][1].body)).toEqual({ remark: null });
    expect(patchCalls()).toHaveLength(0);
  });

  it("does not draw the box without self.list", async () => {
    franchise = remarked;
    me = NO_LIST;
    renderPage();
    expect(await screen.findByRole("button", { name: /^Game\s*2$/ })).toBeInTheDocument();
    expect(remarkBox()).toBeNull();
  });
});
