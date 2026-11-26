// The form-defaults query: one cache entry that /defaults, /add and /modify
// share, and a failure that always means the built-ins.
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  NO_FORM_DEFAULTS,
  formDefaultsQueryKey,
  loadFormDefaults,
  useFormDefaults,
} from "./useFormDefaults";

const CONFIG = { anime: { defaults: { watching_status: "Plan to Watch" } } };

function respond(response) {
  const fetchMock = vi.fn(() => Promise.resolve(response));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const ok = (body) => ({ ok: true, status: 200, json: () => Promise.resolve(body) });

const newClient = () => new QueryClient();

afterEach(() => vi.unstubAllGlobals());

describe("loadFormDefaults", () => {
  it("loads the config into the cache the hook reads", async () => {
    const fetchMock = respond(ok(CONFIG));
    const client = newClient();

    await expect(loadFormDefaults(client)).resolves.toEqual(CONFIG);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/form-defaults/",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(client.getQueryData(formDefaultsQueryKey())).toEqual(CONFIG);
  });

  it("reads a fresh config from the cache instead of fetching it again", async () => {
    const fetchMock = respond(ok(CONFIG));
    const client = newClient();

    await loadFormDefaults(client);
    await loadFormDefaults(client);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["an error status", { ok: false, status: 500, statusText: "Boom", json: () => Promise.resolve({}) }],
    [
      // The SPA catch-all answers an unknown route with index.html.
      "a body that is not JSON",
      { ok: true, status: 200, json: () => Promise.reject(new SyntaxError("Unexpected token <")) },
    ],
  ])("resolves to the built-ins on %s, and caches no config", async (_label, response) => {
    respond(response);
    const client = newClient();

    await expect(loadFormDefaults(client)).resolves.toBe(NO_FORM_DEFAULTS);
    expect(client.getQueryData(formDefaultsQueryKey())).toBeUndefined();
  });

  it("resolves to the built-ins when the request itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("offline"))));

    await expect(loadFormDefaults(newClient())).resolves.toBe(NO_FORM_DEFAULTS);
  });

  it("tries once: a failure does not wait on a retry", async () => {
    const fetchMock = respond({ ok: false, status: 500, json: () => Promise.resolve({}) });
    // The app's client retries once by default; the query opts out.
    const client = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });

    await loadFormDefaults(client);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("useFormDefaults", () => {
  const wrapperFor = (client) =>
    function Wrapper({ children }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    };

  it("shares one request with a page that loads the config at the same time", async () => {
    const fetchMock = respond(ok(CONFIG));
    const client = newClient();

    const { result } = renderHook(() => useFormDefaults(), { wrapper: wrapperFor(client) });
    await expect(loadFormDefaults(client)).resolves.toEqual(CONFIG);
    await waitFor(() => expect(result.current.data).toEqual(CONFIG));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("has no data on a failure, which its readers take as the built-ins", async () => {
    respond({ ok: false, status: 500, json: () => Promise.resolve({}) });
    const { result } = renderHook(() => useFormDefaults(), {
      wrapper: wrapperFor(newClient()),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
