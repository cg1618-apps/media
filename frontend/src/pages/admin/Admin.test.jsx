// Frontend: the Control Center's Calculate & Fix box.
//
// Pins the Sync Cast button: it posts to Calculate All's cast step on its own
// and shows the server's message as its toast, like the Calculate All button
// beside it; CN Display Names does the same for its own step. And Remove
// Uncast Characters: the list opens all ticked, and the
// remove call names only what is still ticked. The two game list-price
// checks: Free Games With a List Price opens all ticked and zeroes only what
// is still ticked, Bought Copies Without a List Price only lists, and both
// leave out an h-game row for a session that may not see the type.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Admin from "./Admin";

const showToast = vi.fn();
vi.mock("../../hooks/useToast", () => ({ useToast: () => ({ showToast }) }));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ has: () => true, visibleGatedTypes: [] }),
}));

const SYNC_CAST = "/api/data-control/calculate/sync-cast";
const SYNC_DISPLAY_NAMES = "/api/data-control/calculate/sync-display-names";
const UNCAST_SCAN = "/api/data-control/check/uncast-characters";
const UNCAST_REMOVE = "/api/data-control/calculate/remove-uncast-characters";
const FREE_SCAN = "/api/data-control/check/free-games-with-list-price";
const FREE_ZERO = "/api/data-control/calculate/zero-free-games-list-price";
const BOUGHT_SCAN = "/api/data-control/check/bought-copies-without-list-price";

// The h-game rows are load-bearing: the mocked session sees no gated type, so
// without one in each payload the hiding would be asserted over nothing.
const FREE_ROWS = [
  {
    system_id: "g1", public_id: 11, media_type: "game", name: "Honkai: Star Rail",
    price_original_us: null, price_original_jp: null, price_original_tw: null,
    storefronts: ["Other"],
  },
  {
    system_id: "g2", public_id: 12, media_type: "game", name: "Teamfight Tactics",
    price_original_us: "9.99", price_original_jp: null, price_original_tw: null,
    storefronts: ["Other"],
  },
  {
    system_id: "h1", public_id: 13, media_type: "h-game", name: "Hidden Free H",
    price_original_us: null, price_original_jp: null, price_original_tw: null,
    storefronts: ["Steam"],
  },
];
const BOUGHT_ROWS = [
  {
    copy_id: "c1", system_id: "g3", public_id: 21, media_type: "game",
    name: "Mario Kart 8", storefront: "Nintendo eShop", copy_format: "Digital",
    price_paid: "59.99", price_currency: "USD",
  },
  {
    copy_id: "c2", system_id: "h2", public_id: 22, media_type: "h-game",
    name: "Hidden Bought H", storefront: "Other", copy_format: "Digital",
    price_paid: null, price_currency: null,
  },
];

let fetchMock;

beforeEach(() => {
  showToast.mockReset();
  fetchMock = vi.fn(async (url) => {
    if (url === SYNC_CAST) {
      return {
        ok: true,
        json: async () => ({
          status: "success",
          message: "Cast synced: 2 character/identity field(s) and 3 cast field(s) filled.",
          counts: {},
        }),
      };
    }
    if (url === SYNC_DISPLAY_NAMES) {
      return {
        ok: true,
        json: async () => ({
          status: "success",
          message: "Display name set to CN on 4 character(s) and 1 identity(ies).",
          counts: { character: 4, identity: 1 },
        }),
      };
    }
    if (url === UNCAST_SCAN) {
      return {
        ok: true,
        json: async () => ({
          status: "success",
          count: 2,
          characters: [
            { system_id: "a", public_id: 1, name: "Asuna", identity_count: 0, has_photo: true },
            { system_id: "b", public_id: 2, name: "Kirito", identity_count: 2, has_photo: false },
          ],
        }),
      };
    }
    if (url === UNCAST_REMOVE) {
      return {
        ok: true,
        json: async () => ({ status: "success", message: "Removed 1 uncast character." }),
      };
    }
    if (url === FREE_SCAN) {
      return {
        ok: true,
        json: async () => ({ status: "success", count: 3, entries: FREE_ROWS }),
      };
    }
    if (url === FREE_ZERO) {
      return {
        ok: true,
        json: async () => ({
          status: "success",
          message: "Set the list price to 0 on 1 free game.",
        }),
      };
    }
    if (url === BOUGHT_SCAN) {
      return {
        ok: true,
        json: async () => ({ status: "success", count: 2, copies: BOUGHT_ROWS }),
      };
    }
    // Everything the page loads on mount: season, logs, announcements, rates.
    return { ok: true, json: async () => [] };
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Control Center Sync Cast", () => {
  it("posts to the cast sync and toasts its message", async () => {
    render(
      <MemoryRouter>
        <Admin />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Sync Cast/ }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        "success",
        "Cast synced: 2 character/identity field(s) and 3 cast field(s) filled.",
      ),
    );
    const call = fetchMock.mock.calls.find(([url]) => url === SYNC_CAST);
    expect(call[1]).toMatchObject({ method: "POST", credentials: "include" });
  });

  it("says it never overwrites", async () => {
    render(
      <MemoryRouter>
        <Admin />
      </MemoryRouter>,
    );
    expect(
      await screen.findByText(/Fill empty cast and character fields from each other/),
    ).toBeInTheDocument();
    // Let the mount-time loads settle inside the test.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });
});

describe("Control Center CN Display Names", () => {
  it("posts to the display-name step and toasts its message", async () => {
    render(
      <MemoryRouter>
        <Admin />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /CN Display Names/ }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        "success",
        "Display name set to CN on 4 character(s) and 1 identity(ies).",
      ),
    );
    const call = fetchMock.mock.calls.find(([url]) => url === SYNC_DISPLAY_NAMES);
    expect(call[1]).toMatchObject({ method: "POST", credentials: "include" });
  });
});

describe("Control Center Remove Uncast Characters", () => {
  it("removes only the characters left ticked", async () => {
    render(
      <MemoryRouter>
        <Admin />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Remove Uncast Characters/ }));
    const keep = await screen.findByRole("checkbox", { name: "Kirito" });
    expect(screen.getByRole("checkbox", { name: "Asuna" })).toBeChecked();
    expect(screen.getByText("+2 identities")).toBeInTheDocument();

    fireEvent.click(keep);
    fireEvent.click(screen.getByRole("button", { name: "Remove Selected (1)" }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith("success", "Removed 1 uncast character."),
    );
    const call = fetchMock.mock.calls.find(([url]) => url === UNCAST_REMOVE);
    expect(call[1]).toMatchObject({ method: "POST", credentials: "include" });
    expect(JSON.parse(call[1].body)).toEqual({ system_ids: ["a"] });
  });
});

describe("Control Center Free Games With a List Price", () => {
  it("zeroes only the visible games left ticked", async () => {
    render(
      <MemoryRouter>
        <Admin />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Free Games With a List Price/ }));
    const keep = await screen.findByRole("checkbox", { name: "Teamfight Tactics" });
    expect(screen.getByRole("checkbox", { name: "Honkai: Star Rail" })).toBeChecked();
    expect(screen.queryByText("Hidden Free H")).not.toBeInTheDocument();

    fireEvent.click(keep);
    fireEvent.click(screen.getByRole("button", { name: "Set Selected to 0 (1)" }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        "success",
        "Set the list price to 0 on 1 free game.",
      ),
    );
    const call = fetchMock.mock.calls.find(([url]) => url === FREE_ZERO);
    expect(call[1]).toMatchObject({ method: "POST", credentials: "include" });
    expect(JSON.parse(call[1].body)).toEqual({ system_ids: ["g1"] });
  });
});

describe("Control Center Bought Copies Without a List Price", () => {
  it("lists the visible copies, each linked to its game", async () => {
    render(
      <MemoryRouter>
        <Admin />
      </MemoryRouter>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Bought Copies Without a List Price/ }),
    );
    const link = await screen.findByRole("link", { name: "Mario Kart 8" });
    expect(link).toHaveAttribute("href", "/game/21/mario-kart-8");
    expect(screen.getByText(/Nintendo eShop/)).toBeInTheDocument();
    expect(screen.getByText(/USD 59\.99/)).toBeInTheDocument();
    expect(screen.queryByText("Hidden Bought H")).not.toBeInTheDocument();
    // List only: nothing in the modal writes.
    expect(screen.queryByRole("button", { name: /Selected/ })).not.toBeInTheDocument();
  });
});
