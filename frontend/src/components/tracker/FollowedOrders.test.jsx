// Following watch orders: the entry page's panel, the dashboard section and
// the Follow / Following toggle. The API is the follows endpoints; see
// docs/systems/watch-orders.md, "Following".
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  it("shows the order, its group, the position and the neighbours", async () => {
    respond({
      "GET /api/watch-order/follows/entry/A": [
        {
          list: LIST,
          owner: OWNER,
          total: 5,
          occurrences: [
            {
              step: step(2, "Here", { note: "watch the OVA first" }),
              previous: step(1, "Before", { ep_start: 1, ep_end: 10 }),
              next: step(3, "After", {
                importance: "Optional",
                section_name: "Part 2",
                note: "skippable",
              }),
            },
          ],
        },
      ],
    });
    renderWith(<FollowedOrderPanel entryId="A" />);

    expect(await screen.findByText("Chronological")).toBeInTheDocument();
    expect(screen.getByText("Test Franchise")).toBeInTheDocument();
    expect(screen.getByText("step 2 / 5")).toBeInTheDocument();
    expect(screen.getByText("Before").closest("a")).toHaveAttribute("href", "/anime/1/before");
    expect(screen.getByText("Ep 1-10")).toBeInTheDocument();
    expect(screen.getByText("After")).toBeInTheDocument();
    expect(screen.getByText("Optional")).toBeInTheDocument();
    expect(screen.getByText("Part 2")).toBeInTheDocument();
    expect(screen.getByText("skippable")).toBeInTheDocument();
    expect(screen.getByText("watch the OVA first")).toBeInTheDocument();
  });

  it("renders nothing when no followed order holds the entry", async () => {
    respond({ "GET /api/watch-order/follows/entry/A": [] });
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
    expect(screen.getByText("Followed watch orders (1)")).toBeInTheDocument();
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
      "GET /api/watch-order/follows": [],
      "PUT /api/watch-order/lists/L1/follow": SUMMARY,
    });
    renderWith(<FollowOrderButton list={LIST} />);

    const button = await screen.findByRole("button", { name: "Follow" });
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/watch-order/lists/L1/follow",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
  });

  it("reads Following and unfollows a followed order", async () => {
    respond({
      "GET /api/watch-order/follows": [SUMMARY],
      "DELETE /api/watch-order/lists/L1/follow": { status: "success" },
    });
    renderWith(<FollowOrderButton list={LIST} />);

    const button = await screen.findByRole("button", { name: "Following" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button);
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/watch-order/lists/L1/follow",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });

  it("is not offered to a viewer who cannot follow", () => {
    auth.permissions = [];
    respond({});
    renderWith(<FollowOrderButton list={LIST} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
