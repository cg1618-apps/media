// Frontend: Modify edits the viewer's own rating and expectation of a
// collection, franchise or series.
//
// Both are kept per account and written through PUT /api/me/ratings under
// self.list, never in the group's PATCH. So the fields are drawn only for a
// viewer who keeps a list, and the PUT goes after the PATCH succeeds, only
// when a value changed from what the form loaded.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Modify from "./Modify";
import * as notesApi from "../notes/api";

vi.mock("../notes/api");

const showToast = vi.fn();
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast }),
}));

// Whether the viewer keeps a list (self.list). Everything else is held, so
// the page is the admin's either way and only the rating gate moves.
const viewer = { keepsList: true };
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    has: (permission) => permission !== "self.list" || viewer.keepsList,
    visibleGatedTypes: [],
    user: { username: "admin" },
    modes: [],
  }),
}));

const ok = (body) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
const failed = () =>
  Promise.resolve({
    ok: false,
    status: 500,
    statusText: "Server Error",
    json: () => Promise.resolve({ detail: "boom" }),
  });

const TIERS = {
  collection: {
    listPath: "/api/collection",
    entry: {
      system_id: "c1",
      collection_name_en: "Marvel",
      my_rating: "B",
      collection_expectation: "Medium",
    },
    noun: "Collection",
  },
  franchise: {
    listPath: "/api/franchise",
    entry: {
      system_id: "c1",
      franchise_name_en: "Avengers",
      franchise_type: "Anime",
      my_rating: "B",
      franchise_expectation: "High",
    },
    noun: "Franchise",
  },
  series: {
    listPath: "/api/series",
    // A series save refuses one with no franchise, so it has one.
    entry: {
      system_id: "c1",
      series_name_en: "Saga",
      franchise_id: "f1",
      my_rating: "B",
      series_expectation: "Medium",
    },
    noun: "Series",
  },
};

const ratingPath = (tier) => `/api/me/ratings/${tier}/c1`;

function mockFetch(tier, { ratingFails = false } = {}) {
  const { listPath, entry } = TIERS[tier];
  return vi.fn((url, options = {}) => {
    const u = String(url);
    const method = options.method || "GET";
    if (u === ratingPath(tier) && method === "PUT") {
      if (ratingFails) return failed();
      const body = JSON.parse(options.body);
      return ok({
        owner_type: tier,
        owner_id: "c1",
        my_rating: "my_rating" in body ? body.my_rating : entry.my_rating,
        expectation:
          "expectation" in body ? body.expectation : (entry[`${tier}_expectation`] ?? null),
      });
    }
    if (method === "GET" && u.startsWith(`${listPath}/?`)) return ok([entry]);
    if (method === "GET" && u.startsWith("/api/franchise/?"))
      return ok([{ system_id: "f1", franchise_name_en: "Parent" }]);
    // The PATCH answers the row as it was read, rating included: the rating
    // is not the PATCH's to change.
    if (method === "PATCH" && u === `${listPath}/${entry.system_id}`) return ok(entry);
    return ok([]);
  });
}

function mount(tier) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/modify?type=${tier}&id=c1`]}>
        <Modify />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const callsTo = (fetchMock, method, path) =>
  fetchMock.mock.calls.filter(
    ([url, opts]) => String(url) === path && (opts?.method || "GET") === method,
  );

beforeEach(() => {
  showToast.mockReset();
  viewer.keepsList = true;
  vi.mocked(notesApi.fetchSections).mockResolvedValue([]);
  vi.mocked(notesApi.fetchNotes).mockResolvedValue([]);
  vi.stubGlobal("scrollTo", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Modify franchise — rating and expectation are the viewer's own", () => {
  it("draws both, loaded from the row, for a viewer who keeps a list", async () => {
    vi.stubGlobal("fetch", mockFetch("franchise"));
    mount("franchise");

    expect(await screen.findByLabelText("My Rating")).toHaveValue("B");
    expect(screen.getByLabelText("Expectation")).toHaveValue("High");
  });

  it("draws neither for a viewer without a list", async () => {
    viewer.keepsList = false;
    vi.stubGlobal("fetch", mockFetch("franchise"));
    mount("franchise");

    // The form is up (its name field holds the row) before the absence is read.
    expect(await screen.findByDisplayValue("Avengers")).toBeInTheDocument();
    expect(screen.queryByLabelText("My Rating")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Expectation")).not.toBeInTheDocument();
  });

  it("PUTs a changed rating and expectation after the PATCH, and nothing in the PATCH", async () => {
    const fetchMock = mockFetch("franchise");
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    mount("franchise");

    await user.selectOptions(await screen.findByLabelText("My Rating"), "S");
    await user.selectOptions(screen.getByLabelText("Expectation"), "Highest");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(callsTo(fetchMock, "PUT", ratingPath("franchise"))).toHaveLength(1),
    );
    const [, init] = callsTo(fetchMock, "PUT", ratingPath("franchise"))[0];
    expect(JSON.parse(init.body)).toEqual({ my_rating: "S", expectation: "Highest" });

    const patch = callsTo(fetchMock, "PATCH", "/api/franchise/c1")[0];
    const patchBody = JSON.parse(patch[1].body);
    expect(patchBody).not.toHaveProperty("my_rating");
    expect(patchBody).not.toHaveProperty("franchise_expectation");
    expect(patchBody).not.toHaveProperty("expectation");
    const order = fetchMock.mock.calls.map(([url, opts]) => `${opts?.method} ${url}`);
    expect(order.indexOf("PATCH /api/franchise/c1")).toBeLessThan(
      order.indexOf(`PUT ${ratingPath("franchise")}`),
    );
  });

  it("sends only the key that changed", async () => {
    const fetchMock = mockFetch("franchise");
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    mount("franchise");

    await user.selectOptions(await screen.findByLabelText("Expectation"), "");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(callsTo(fetchMock, "PUT", ratingPath("franchise"))).toHaveLength(1),
    );
    const [, init] = callsTo(fetchMock, "PUT", ratingPath("franchise"))[0];
    expect(JSON.parse(init.body)).toEqual({ expectation: null });
  });

  it("sends no PUT when neither changed", async () => {
    const fetchMock = mockFetch("franchise");
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    mount("franchise");

    await screen.findByLabelText("My Rating");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(callsTo(fetchMock, "PATCH", "/api/franchise/c1")).toHaveLength(1),
    );
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith("success", "Update successful."),
    );
    expect(callsTo(fetchMock, "PUT", ratingPath("franchise"))).toHaveLength(0);
  });

  it("says the franchise saved but the rating did not when the PUT fails", async () => {
    const fetchMock = mockFetch("franchise", { ratingFails: true });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    mount("franchise");

    await user.selectOptions(await screen.findByLabelText("My Rating"), "S");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        "error",
        "Franchise saved, but your rating did not save.",
      ),
    );
  });
});

describe.each(["collection", "series"])("Modify %s — the viewer's own rating", (tier) => {
  it("draws both, loaded from the row, and PUTs what changed", async () => {
    const fetchMock = mockFetch(tier);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    mount(tier);

    const rating = await screen.findByLabelText("My Rating");
    expect(rating).toHaveValue("B");
    expect(screen.getByLabelText("Expectation")).toHaveValue("Medium");

    await user.selectOptions(rating, "A+");
    await user.selectOptions(screen.getByLabelText("Expectation"), "Highest");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(callsTo(fetchMock, "PUT", ratingPath(tier))).toHaveLength(1));
    const [, init] = callsTo(fetchMock, "PUT", ratingPath(tier))[0];
    expect(JSON.parse(init.body)).toEqual({ my_rating: "A+", expectation: "Highest" });
    // The saved rating survives the form reloading from the saved row (a
    // series save does reload it).
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith("success", "Update successful."),
    );
    expect(screen.getByLabelText("My Rating")).toHaveValue("A+");
    expect(screen.getByLabelText("Expectation")).toHaveValue("Highest");
  });

  it("draws no rating for a viewer without a list", async () => {
    viewer.keepsList = false;
    vi.stubGlobal("fetch", mockFetch(tier));
    mount(tier);

    expect(
      await screen.findByDisplayValue(TIERS[tier].entry[`${tier}_name_en`]),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("My Rating")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Expectation")).not.toBeInTheDocument();
  });
});
