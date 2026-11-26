// Add's forms start from the /defaults config: loaded beside the suggestion
// lists, through the cache /defaults writes, and in place before the first
// paint of any form.
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Add from "./Add";
import { formDefaultsQueryKey } from "../../hooks/useFormDefaults";
import { fetchAllSources } from "../../lib/sources";
import * as notesApi from "../notes/api";

vi.mock("../notes/api");
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock("../../lib/sources", () => ({ fetchAllSources: vi.fn() }));

const SOURCES = { options: [], studios: [], publishers: {}, people: {} };
const CONFIG = { anime: { defaults: { ep_total: "24" } } };

const ok = (body) => ({ ok: true, status: 200, json: () => Promise.resolve(body) });

// Every request answers []; the form-defaults list answers `formDefaults()`.
function stubFetch(formDefaults) {
  const fetchMock = vi.fn((url) =>
    Promise.resolve(String(url) === "/api/form-defaults/" ? formDefaults() : ok([])),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function mount(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  render(
    <QueryClientProvider client={client}>
      <Add />
    </QueryClientProvider>,
  );
  return client;
}

const formDefaultsCalls = (fetchMock) =>
  fetchMock.mock.calls.filter(([url]) => String(url) === "/api/form-defaults/");

beforeEach(() => {
  vi.mocked(notesApi.fetchSections).mockResolvedValue([]);
  vi.mocked(notesApi.fetchNotes).mockResolvedValue([]);
  vi.mocked(fetchAllSources).mockResolvedValue(SOURCES);
});
afterEach(() => vi.unstubAllGlobals());

describe("Add page form defaults", () => {
  it("loads the config and the suggestion lists side by side", async () => {
    const config = deferred();
    const sources = deferred();
    vi.mocked(fetchAllSources).mockReturnValue(sources.promise);
    const fetchMock = stubFetch(() => config.promise);
    mount();

    // Both are asked for while neither has answered.
    await waitFor(() => expect(formDefaultsCalls(fetchMock)).toHaveLength(1));
    expect(fetchAllSources).toHaveBeenCalled();

    config.resolve(ok(CONFIG));
    sources.resolve(SOURCES);
    await waitFor(() => expect(screen.queryByText("Loading...")).toBeNull());
  });

  it("holds every form until the config is in, then opens on it", async () => {
    const config = deferred();
    stubFetch(() => config.promise);
    mount();

    // The lists are in; the config is not, so no form has painted yet.
    await waitFor(() => expect(fetchAllSources).toHaveBeenCalled());
    await Promise.resolve();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("English title")).toBeNull();

    config.resolve(ok(CONFIG));
    await screen.findByPlaceholderText("English title");
    expect(screen.getByDisplayValue("24")).toBeInTheDocument();
  });

  it("opens on the config /defaults left in the cache, without fetching it", async () => {
    const fetchMock = stubFetch(() => ok({}));
    const client = new QueryClient();
    client.setQueryData(formDefaultsQueryKey(), CONFIG);
    mount(client);

    await screen.findByPlaceholderText("English title");
    expect(screen.getByDisplayValue("24")).toBeInTheDocument();
    expect(formDefaultsCalls(fetchMock)).toHaveLength(0);
  });

  it("opens on the built-ins when the config cannot be read", async () => {
    stubFetch(() => ({ ok: false, status: 500, json: () => Promise.resolve({}) }));
    mount();

    await screen.findByPlaceholderText("English title");
    expect(screen.queryByDisplayValue("24")).toBeNull();
  });
});
