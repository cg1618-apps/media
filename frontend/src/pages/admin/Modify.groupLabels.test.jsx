// Frontend: Modify labels a collection and a series the way it labels a
// franchise. The picker reads the group's current set from the tier's own
// endpoint, a save that ADDS a label asks first and says what the tier's
// label hides, and the set is PUT to that endpoint after the PATCH.
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
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    has: () => true,
    visibleGatedTypes: [],
    user: { username: "admin" },
    modes: [],
  }),
}));

const VOCABULARY = [
  { system_id: "1", key: "nsfw", label: "NSFW", description: "" },
  { system_id: "2", key: "erotica", label: "擦邊肉番", description: "" },
];

const ok = (body) =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  });

const TIERS = {
  collection: {
    listPath: "/api/collection",
    entry: { system_id: "c1", collection_name_en: "Marvel" },
    hides: "this collection and every franchise, series and entry in it",
    note: /a labelled collection is hidden.*every franchise, series and entry in it/i,
  },
  franchise: {
    listPath: "/api/franchise",
    entry: { system_id: "c1", franchise_name_en: "Avengers", franchise_type: "ACG" },
    hides: "this franchise and every series and entry in it",
    note: /a labelled franchise is hidden.*every series and entry in it/i,
  },
  series: {
    listPath: "/api/series",
    // A series save refuses one with no franchise, so it has one.
    entry: { system_id: "c1", series_name_en: "Saga", franchise_id: "f1" },
    hides: "this series and every entry in it",
    note: /a labelled series is hidden.*every entry in it/i,
  },
};

function mockFetch(tier, { loaded }) {
  const { listPath, entry } = TIERS[tier];
  const labelPath = `/api/content-labels/${tier}/${entry.system_id}`;
  return vi.fn((url, options = {}) => {
    const u = String(url);
    const method = options.method || "GET";
    if (u === "/api/content-labels/" && method === "GET") return ok(VOCABULARY);
    if (u === labelPath && method === "GET") return ok(loaded);
    if (u === labelPath && method === "PUT")
      return ok(JSON.parse(options.body).label_keys);
    if (method === "GET" && u.startsWith(`${listPath}/?`)) return ok([entry]);
    if (method === "GET" && u.startsWith("/api/franchise/?"))
      return ok([{ system_id: "f1", franchise_name_en: "Parent" }]);
    if (method === "PATCH" && u === `${listPath}/${entry.system_id}`)
      return ok(entry);
    return ok([]);
  });
}

function mount(tier) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter
        initialEntries={[`/modify?type=${tier}&id=${TIERS[tier].entry.system_id}`]}
      >
        <Modify />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function labelCalls(fetchMock, method) {
  return fetchMock.mock.calls.filter(
    ([url, opts]) =>
      String(url).startsWith("/api/content-labels/") &&
      String(url) !== "/api/content-labels/" &&
      (opts?.method || "GET") === method,
  );
}

beforeEach(() => {
  showToast.mockReset();
  vi.mocked(notesApi.fetchSections).mockResolvedValue([]);
  vi.mocked(notesApi.fetchNotes).mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.each(["collection", "franchise", "series"])("Modify %s labels", (tier) => {
  it("reads the current set from the tier's endpoint and says what it hides", async () => {
    const fetchMock = mockFetch(tier, { loaded: ["erotica", "nsfw"] });
    vi.stubGlobal("fetch", fetchMock);
    mount(tier);

    const erotica = await screen.findByLabelText("擦邊肉番");
    await waitFor(() => expect(erotica).toBeChecked());
    expect(labelCalls(fetchMock, "GET")[0][0]).toBe(
      `/api/content-labels/${tier}/c1`,
    );
    expect(screen.getByText(TIERS[tier].note)).toBeInTheDocument();
  });

  it("asks before a save that adds a label, then PUTs the set", async () => {
    const fetchMock = mockFetch(tier, { loaded: [] });
    vi.stubGlobal("fetch", fetchMock);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    mount(tier);

    const erotica = await screen.findByLabelText("擦邊肉番");
    await waitFor(() => expect(labelCalls(fetchMock, "GET")).toHaveLength(1));
    await user.click(erotica);
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toContain(`hides ${TIERS[tier].hides}`);
    await waitFor(() => expect(labelCalls(fetchMock, "PUT")).toHaveLength(1));
    const [url, init] = labelCalls(fetchMock, "PUT")[0];
    expect(url).toBe(`/api/content-labels/${tier}/c1`);
    expect(JSON.parse(init.body)).toEqual({ label_keys: ["erotica", "nsfw"] });
  });

  it("writes nothing when the admin declines the confirm", async () => {
    const fetchMock = mockFetch(tier, { loaded: [] });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    mount(tier);

    const erotica = await screen.findByLabelText("擦邊肉番");
    await waitFor(() => expect(labelCalls(fetchMock, "GET")).toHaveLength(1));
    await user.click(erotica);
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(labelCalls(fetchMock, "PUT")).toHaveLength(0);
    expect(
      fetchMock.mock.calls.some(([, opts]) => opts?.method === "PATCH"),
    ).toBe(false);
  });
});
