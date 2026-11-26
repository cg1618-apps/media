// Frontend: the Control Center's Calculate & Fix box.
//
// Pins the Sync Cast button: it posts to Calculate All's cast step on its own
// and shows the server's message as its toast, like the Calculate All button
// beside it; CN Display Names does the same for its own step. And Remove
// Uncast Characters: the list opens all ticked, and the
// remove call names only what is still ticked. The two game list-price
// checks: Free Games With a List Price opens all ticked and zeroes only what
// is still ticked, Bought Copies Without a List Price only lists, and both
// leave out an h-game row for a session that may not see the type. The page
// frame: its title, the one top link (Data History, the System nav group's
// other page), Exchange Rates below the announcements, and the Data Control
// Log, whose Details popup lists each operation a run ran.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Admin from "./Admin";

// The Announcement & Notes card reads the ["announcements"] query, so every
// render needs a client; a fresh one per render keeps tests independent.
function render(ui) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const showToast = vi.fn();
vi.mock("../../hooks/useToast", () => ({ useToast: () => ({ showToast }) }));
// The pending-registrations panel has its own test and needs a query client.
vi.mock("./PendingRegistrations", () => ({ default: () => null }));
// Every permission by default; a test narrows `held` to drop one.
const session = vi.hoisted(() => ({ held: null }));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    has: (p) => (session.held ? session.held.includes(p) : true),
    visibleGatedTypes: [],
  }),
}));

const SYNC_CAST = "/api/data-control/calculate/sync-cast";
const SYNC_DISPLAY_NAMES = "/api/data-control/calculate/sync-display-names";
const UNCAST_SCAN = "/api/data-control/check/uncast-characters";
const UNCAST_REMOVE = "/api/data-control/calculate/remove-uncast-characters";
const FREE_SCAN = "/api/data-control/check/free-games-with-list-price";
const FREE_ZERO = "/api/data-control/calculate/zero-free-games-list-price";
const BOUGHT_SCAN = "/api/data-control/check/bought-copies-without-list-price";
const LOGS = "/api/system/logs";

// A Fill All run with two operations, and a single Sync Cast. The run's
// operations are only in its own read, so the popup has to fetch them.
const LOG_ROWS = [
  {
    id: 7, parent_id: null, action_main: "Fill", action_specific: "Fill All",
    type: "Manual", status: "Failed", rows_added: 0, rows_updated: 3,
    rows_deleted: 0, error_message: "IGDB down", details_json: null,
    timestamp: "2026-11-26T10:00:00", child_count: 2,
  },
  {
    id: 9, parent_id: null, action_main: "Calculate", action_specific: "Sync Cast",
    type: "Manual", status: "Success", rows_added: 0, rows_updated: 0,
    rows_deleted: 0, error_message: null, details_json: null,
    timestamp: "2026-11-26T11:00:00", child_count: 0,
  },
];
const RUN_DETAIL = {
  ...LOG_ROWS[0],
  children: [
    {
      id: 5, parent_id: 7, action_main: "Fill", action_specific: "Fill Anime",
      type: "Manual", status: "Success", rows_added: 0, rows_updated: 3,
      rows_deleted: 0, error_message: null, details_json: null,
      timestamp: "2026-11-26T09:40:00", child_count: 0,
    },
    {
      id: 6, parent_id: 7, action_main: "Fill", action_specific: "Fill Game",
      type: "Manual", status: "Failed", rows_added: 0, rows_updated: 0,
      rows_deleted: 0, error_message: "IGDB down", details_json: null,
      timestamp: "2026-11-26T09:55:00", child_count: 0,
    },
  ],
};

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
    if (url === LOGS) {
      return { ok: true, json: async () => LOG_ROWS };
    }
    if (url === `${LOGS}/7`) {
      return { ok: true, json: async () => RUN_DETAIL };
    }
    if (url === `${LOGS}/9`) {
      return { ok: true, json: async () => ({ ...LOG_ROWS[1], children: [] }) };
    }
    // Everything else the page loads on mount: season, announcements, rates.
    return { ok: true, json: async () => [] };
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  session.held = null;
});

describe("Control Center announcements", () => {
  // The editor asks manage.announcements, not the page's manage.pipelines.
  // The refusal holds manage.pipelines (the page is drawn: Sync Cast is
  // there), so the missing editor is its own gate's doing; the admin's set,
  // which holds both, is the mirror.
  it("draws no announcement editor without manage.announcements", async () => {
    session.held = ["manage.pipelines"];
    render(
      <MemoryRouter>
        <Admin />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: /Sync Cast/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add announcement" })).toBeNull();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it("draws it for the admin, who holds manage.announcements", async () => {
    session.held = ["admin.authz", "manage.pipelines", "manage.announcements"];
    render(
      <MemoryRouter>
        <Admin />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("button", { name: "Add announcement" }),
    ).toBeInTheDocument();
  });
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

function renderPage() {
  return render(
    <MemoryRouter>
      <Admin />
    </MemoryRouter>,
  );
}

describe("Control Center page frame", () => {
  it("is titled Control Center, with no subtitle", async () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Control Center" })).toBeInTheDocument();
    expect(screen.queryByText(/System Administration/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Master control center/)).not.toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it("shows the current season with no Active Season Config label", async () => {
    renderPage();
    expect(screen.getByText("Current Season")).toBeInTheDocument();
    expect(screen.queryByText("Active Season Config")).not.toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it("links on top only to the System group's other page, Data History", async () => {
    // Review Queue and Clean Orphans are gone from the nav's System group,
    // and the Entry and Note pages have nav groups of their own.
    renderPage();
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toContain("/data-history");
    for (const gone of [
      "/options", "/aliases", "/review-queue", "/clean-orphans", "/add", "/modify", "/delete",
    ]) {
      expect(links).not.toContain(gone);
    }
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it("draws Exchange Rates below Announcement & Notes", async () => {
    renderPage();
    const announcements = await screen.findByText("Announcement & Notes");
    const rates = screen.getByText("Exchange Rates");
    expect(
      announcements.compareDocumentPosition(rates) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("Control Center Data Control Log", () => {
  it("lists runs without the rows-changed metrics", async () => {
    renderPage();
    expect(
      await screen.findByRole("button", { name: "Details for Fill All" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Metrics")).not.toBeInTheDocument();
    expect(screen.queryByText("+0")).not.toBeInTheDocument();
  });

  it("opens a run's operations, each with its trigger, time and status", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Details for Fill All" }));

    const dialog = await screen.findByRole("dialog", { name: "Fill All" });
    expect(await within(dialog).findByText("Fill Anime")).toBeInTheDocument();
    expect(within(dialog).getByText("Fill Game")).toBeInTheDocument();
    const rows = within(dialog).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Manual")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Success")).toBeInTheDocument();
    expect(within(rows[0]).getByText(/Nov 26/)).toBeInTheDocument();
    expect(within(rows[1]).getByText("Failed")).toBeInTheDocument();
    expect(within(rows[1]).getByText("IGDB down")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows a single operation as its own one row", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Details for Sync Cast" }));

    const dialog = await screen.findByRole("dialog", { name: "Sync Cast" });
    await waitFor(() => expect(within(dialog).getAllByRole("row")).toHaveLength(2));
    expect(within(dialog).getByText("Success")).toBeInTheDocument();
  });
});
