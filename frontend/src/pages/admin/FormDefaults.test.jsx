// The /defaults page: reads the config through the shared form-defaults
// query, writes it back on save and reset so Add and Modify never open on
// stale defaults, and keeps each tab's unsaved draft.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import FormDefaults from "./FormDefaults";
import { BUILTIN_AUTOFILL } from "../../config/formFields";
import { formDefaultsQueryKey } from "../../hooks/useFormDefaults";
import { fetchAllSources } from "../../lib/sources";

const showToast = vi.fn();
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast }),
}));
vi.mock("../../lib/sources", () => ({ fetchAllSources: vi.fn() }));

const STORED = {
  anime: {
    media_type: "anime",
    version: 1,
    defaults: { watching_status: "Plan to Watch" },
    autofill: null,
    restricted_prefill: null,
  },
  movie: {
    media_type: "movie",
    version: 1,
    defaults: {},
    autofill: [],
    restricted_prefill: null,
  },
};

let listResponse;

function stubFetch() {
  const fetchMock = vi.fn((url, init = {}) => {
    const u = String(url);
    if (u === "/api/form-defaults/" && !init.method) return Promise.resolve(listResponse());
    if (u.startsWith("/api/form-defaults/")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ message: "ok" }),
      });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const ok = (body) => () => ({ ok: true, status: 200, json: () => Promise.resolve(body) });

beforeEach(() => {
  showToast.mockReset();
  listResponse = ok(STORED);
  vi.mocked(fetchAllSources).mockResolvedValue({
    options: [],
    studios: [],
    publishers: {},
    people: {},
  });
});
afterEach(() => vi.unstubAllGlobals());

function mount(client = new QueryClient()) {
  render(
    <QueryClientProvider client={client}>
      <FormDefaults />
    </QueryClientProvider>,
  );
  return client;
}

const firstTick = () =>
  screen.getAllByRole("checkbox", { name: /^Replace .+ when choosing an existing entry$/ })[0];

async function loaded() {
  await waitFor(() => expect(screen.queryByText("Loading...")).toBeNull());
}

describe("FormDefaults", () => {
  it("loads the config and the suggestion lists side by side", async () => {
    let release;
    listResponse = () =>
      new Promise((resolve) => {
        release = () => resolve(ok(STORED)());
      });
    const fetchMock = stubFetch();
    mount();

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/form-defaults/", expect.anything()),
    );
    // The config is still unanswered, and the lists have already started.
    expect(fetchAllSources).toHaveBeenCalled();
    expect(screen.getByText("Loading...")).toBeInTheDocument();

    release();
    await loaded();
  });

  it("reads a config another page already loaded, without fetching it again", async () => {
    const fetchMock = stubFetch();
    const client = new QueryClient();
    client.setQueryData(formDefaultsQueryKey(), STORED);
    mount(client);
    await loaded();

    expect(fetchMock).not.toHaveBeenCalledWith("/api/form-defaults/", expect.anything());
  });

  it.each([
    ["an error status", () => ({ ok: false, status: 500, json: () => Promise.resolve({}) })],
    [
      "a body that is not JSON",
      () => ({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError("<")) }),
    ],
  ])("shows the built-ins on %s", async (_label, response) => {
    listResponse = response;
    stubFetch();
    mount();
    await loaded();

    // Every built-in auto-fill field is ticked, and nothing is overridden.
    const ticked = screen
      .getAllByRole("checkbox", { name: /^Replace .+ when choosing an existing entry$/ })
      .filter((box) => box.checked);
    expect(ticked).toHaveLength(BUILTIN_AUTOFILL.anime.length);
    expect(screen.getByText(/^0 fields overridden/)).toBeInTheDocument();
    expect(showToast).toHaveBeenCalledWith("error", expect.stringMatching(/built-ins/));
  });

  it("writes a save into the shared cache, so Add and Modify read it at once", async () => {
    stubFetch();
    const client = mount();
    await loaded();

    fireEvent.click(firstTick());
    const ticked = firstTick().checked;
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(screen.queryByText("Unsaved changes")).toBeNull());
    const cached = client.getQueryData(formDefaultsQueryKey());
    expect(cached.anime.defaults).toEqual({ watching_status: "Plan to Watch" });
    expect(cached.anime.autofill.length).toBe(
      BUILTIN_AUTOFILL.anime.length + (ticked ? 1 : -1),
    );
    // The other types' stored config is untouched.
    expect(cached.movie).toEqual(STORED.movie);
  });

  it("drops a reset type from the shared cache", async () => {
    vi.stubGlobal("confirm", () => true);
    const fetchMock = stubFetch();
    const client = mount();
    await loaded();

    fireEvent.click(screen.getByRole("button", { name: /reset tab to built-in/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/form-defaults/anime",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    await waitFor(() =>
      expect(client.getQueryData(formDefaultsQueryKey())).not.toHaveProperty("anime"),
    );
    expect(client.getQueryData(formDefaultsQueryKey()).movie).toEqual(STORED.movie);
  });

  it("keeps a tab's unsaved draft across tab switches, and warns before unload", async () => {
    stubFetch();
    mount();
    await loaded();

    fireEvent.click(firstTick());
    const ticked = firstTick().checked;

    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Movie" }));
    fireEvent.click(screen.getByRole("button", { name: "Anime" }));
    expect(firstTick().checked).toBe(ticked);
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });
});
