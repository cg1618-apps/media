// Following orders: the entry page's panel, the dashboard section and
// the Follow / Following toggle. The API is the follows endpoints; see
// docs/systems/orders.md, "Following".
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import FollowedOrderPanel, { stepPosition } from "./FollowedOrderPanel";
import FollowedOrders from "./FollowedOrders";
import FollowOrderButton from "./FollowOrderButton";

const auth = { permissions: ["self.list"] };
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ has: (p) => auth.permissions.includes(p) }),
}));
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const step = (number, name, extra = {}) => ({
  number,
  state: "pending",
  media_type: "anime",
  entry_id: `e${number}`,
  public_id: number,
  display_name: name,
  ep_start: null,
  ep_end: null,
  importance: "Normal",
  note: null,
  section_name: null,
  step_id: `i${number}`,
  skipped: false,
  ...extra,
});

const LIST = {
  system_id: "L1",
  public_id: 7,
  list_name: "Chronological",
  auto_source: null,
};
const OWNER = {
  tier: "franchise",
  system_id: "F1",
  public_id: 3,
  display_name: "Test Franchise",
};

const SUMMARY = {
  list: LIST,
  owner: OWNER,
  done: 2,
  total: 5,
  now: [
    step(3, "Season 2", { state: "active", ep_start: 1, ep_end: 12 }),
    step(4, "Side Show", { state: "active" }),
  ],
  up_next: step(1, "The Gap", { importance: "Essential" }),
};

function respond(routes) {
  global.fetch = vi.fn(async (url, opts = {}) => {
    const key = `${opts.method || "GET"} ${url}`;
    const body = routes[key];
    if (body === undefined) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => body };
  });
}

function renderWith(ui) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  auth.permissions = ["self.list"];
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("FollowedOrderPanel", () => {
  it("shows the order, its group, the position and what is next", async () => {
    respond({
      "GET /api/order/follows/entry/A": [
        {
          list: LIST,
          owner: OWNER,
          importance: "Normal",
          total: 5,
          occurrences: [
            {
              step: step(2, "Here", { note: "watch the OVA first" }),
              next: step(3, "After", {
                ep_start: 1,
                ep_end: 10,
                section_name: "Part 2",
                note: "the next arc",
              }),
              coming_up: [],
            },
          ],
        },
      ],
    });
    renderWith(<FollowedOrderPanel entryId="A" />);

    expect(await screen.findByText("Chronological")).toBeInTheDocument();
    expect(screen.getByText("Test Franchise")).toBeInTheDocument();
    expect(screen.getByText("step 2 / 5 · Normal and up")).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();
    expect(screen.getByText("After").closest("a")).toHaveAttribute("href", "/anime/3/after");
    expect(screen.getByText("Ep 1-10")).toBeInTheDocument();
    expect(screen.getByText("Part 2")).toBeInTheDocument();
    expect(screen.getByText("the next arc")).toBeInTheDocument();
    // No "previous" and no "this" rows any more.
    expect(screen.queryByText("Prev")).toBeNull();
    expect(screen.queryByText("This")).toBeNull();
    expect(screen.queryByText("Here")).toBeNull();
    expect(screen.queryByText("Coming up")).toBeNull();
  });

  it("sets the lookahead apart from the direct next, under Coming up", async () => {
    // The owner's example on F: H is next, J and L are shown because they
    // rank higher.
    respond({
      "GET /api/order/follows/entry/A": [
        {
          list: LIST,
          owner: OWNER,
          importance: "Normal",
          total: 7,
          occurrences: [
            {
              step: step(1, "F"),
              next: step(3, "H", { step_id: "iH" }),
              coming_up: [
                step(5, "J", { importance: "Recommended", step_id: "iJ" }),
                step(7, "L", { importance: "Essential", step_id: "iL" }),
              ],
            },
          ],
        },
      ],
    });
    renderWith(<FollowedOrderPanel entryId="A" />);

    const upNext = await screen.findByText("H");
    const comingUp = screen.getByText("Coming up").parentElement;
    expect(comingUp).not.toContainElement(upNext);
    expect(within(comingUp).getByText("J")).toBeInTheDocument();
    expect(within(comingUp).getByText("L")).toBeInTheDocument();
    expect(within(comingUp).getByText("Recommended")).toBeInTheDocument();
    expect(within(comingUp).getByText("Essential")).toBeInTheDocument();
    // Every row carries its importance and a skip toggle.
    expect(screen.getByText("Normal")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Skip" })).toHaveLength(3);
  });

  it("skips a step from the panel", async () => {
    respond({
      "GET /api/order/follows/entry/A": [
        {
          list: LIST,
          owner: OWNER,
          importance: "Normal",
          total: 3,
          occurrences: [
            { step: step(1, "F"), next: step(2, "G", { step_id: "iG" }), coming_up: [] },
          ],
        },
      ],
      "PUT /api/order/lists/L1/follow/skips/iG": SUMMARY,
    });
    renderWith(<FollowedOrderPanel entryId="A" />);

    fireEvent.click(await screen.findByRole("button", { name: "Skip" }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/order/lists/L1/follow/skips/iG",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
  });

  it("says so when nothing is left after the entry", async () => {
    respond({
      "GET /api/order/follows/entry/A": [
        {
          list: LIST,
          owner: OWNER,
          importance: "Essential",
          total: 2,
          occurrences: [{ step: step(2, "Last"), next: null, coming_up: [] }],
        },
      ],
    });
    renderWith(<FollowedOrderPanel entryId="A" />);
    expect(await screen.findByText("Nothing left after this step.")).toBeInTheDocument();
    expect(screen.getByText("step 2 / 2 · Essential only")).toBeInTheDocument();
  });

  it("calls it an order on every type, a game's page included", async () => {
    respond({
      "GET /api/order/follows/entry/A": [
        { list: LIST, owner: OWNER, total: 1, occurrences: [{ step: step(1, "Here") }] },
      ],
    });
    renderWith(<FollowedOrderPanel entryId="A" />);
    expect(await screen.findByText("Following order")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Followed orders" })).toBeInTheDocument();
    expect(screen.queryByText(/Play Order|Watch Order|Read Order/)).toBeNull();
  });

  it("renders nothing when no followed order holds the entry", async () => {
    respond({ "GET /api/order/follows/entry/A": [] });
    const { container } = renderWith(<FollowedOrderPanel entryId="A" />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("asks nothing of a viewer who cannot follow", () => {
    auth.permissions = [];
    respond({});
    const { container } = renderWith(<FollowedOrderPanel entryId="A" />);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it("numbers every occurrence of a split run", () => {
    const occ = (n) => ({ step: step(n, "A") });
    expect(stepPosition([occ(1), occ(3)], 4)).toBe("steps 1, 3 / 4");
  });
});

describe("FollowedOrders", () => {
  it("is collapsed by default and counts the follows in its title", () => {
    renderWith(<FollowedOrders id="x" follows={[SUMMARY]} />);
    expect(screen.getByText("Followed orders (1)")).toBeInTheDocument();
    // The count is the title's alone: nothing repeats it at the right.
    expect(screen.getByRole("heading", { name: "Followed orders (1)" }).parentElement)
      .toHaveTextContent(/^Followed orders \(1\)$/);
    expect(screen.queryByText("Chronological")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Expand")).toHaveAttribute("aria-expanded", "false");
  });

  it("opens to done / total, every active step and the step up next", () => {
    renderWith(<FollowedOrders id="x" follows={[SUMMARY]} />);
    fireEvent.click(screen.getByLabelText("Expand"));

    expect(screen.getByText("Chronological")).toBeInTheDocument();
    expect(screen.getByText("2 / 5")).toBeInTheDocument();
    expect(screen.getAllByText("Now")).toHaveLength(2);
    expect(screen.getByText("Season 2")).toBeInTheDocument();
    expect(screen.getByText("Side Show")).toBeInTheDocument();
    expect(screen.getByText("The Gap")).toBeInTheDocument();
    expect(screen.getByText("Essential")).toBeInTheDocument();
  });
});

describe("FollowOrderButton", () => {
  it("follows an order the viewer does not follow", async () => {
    respond({
      "GET /api/order/follows": [],
      "PUT /api/order/lists/L1/follow": SUMMARY,
    });
    renderWith(<FollowOrderButton list={LIST} />);

    const button = await screen.findByRole("button", { name: "Follow" });
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/order/lists/L1/follow",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
  });

  it("reads Following and unfollows a followed order", async () => {
    respond({
      "GET /api/order/follows": [SUMMARY],
      "DELETE /api/order/lists/L1/follow": { status: "success" },
    });
    renderWith(<FollowOrderButton list={LIST} />);

    const button = await screen.findByRole("button", { name: "Following" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button);
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/order/lists/L1/follow",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });

  it("follows at the importance picked before following", async () => {
    respond({
      "GET /api/order/follows": [],
      "PUT /api/order/lists/L1/follow": SUMMARY,
    });
    renderWith(<FollowOrderButton list={LIST} />);

    const picker = await screen.findByLabelText("Follow importance");
    await waitFor(() => expect(picker).not.toBeDisabled());
    expect(picker).toHaveValue("Normal");
    fireEvent.change(picker, { target: { value: "Recommended" } });
    // Picking before following only chooses; nothing is written yet.
    expect(global.fetch).not.toHaveBeenCalledWith(
      "/api/order/lists/L1/follow",
      expect.anything(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Follow" }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/order/lists/L1/follow",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ importance: "Recommended" }),
        }),
      ),
    );
  });

  it("changes a followed order's importance straight away", async () => {
    respond({
      "GET /api/order/follows": [{ ...SUMMARY, importance: "Essential" }],
      "PUT /api/order/lists/L1/follow": SUMMARY,
    });
    renderWith(<FollowOrderButton list={LIST} />);

    const picker = await screen.findByLabelText("Follow importance");
    await waitFor(() => expect(picker).toHaveValue("Essential"));
    fireEvent.change(picker, { target: { value: "Optional" } });
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/order/lists/L1/follow",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ importance: "Optional" }),
        }),
      ),
    );
  });

  it("is not offered to a viewer who cannot follow", () => {
    auth.permissions = [];
    respond({});
    renderWith(<FollowOrderButton list={LIST} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Follow importance")).not.toBeInTheDocument();
  });
});
