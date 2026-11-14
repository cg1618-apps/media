// useStatusToggle sends each value to the route that owns it: plan flags to
// /api/me/plan-flags, every other personal key to /api/me/list, and only an
// explicit `catalogue` payload to the entry PATCH. The answer folds the saved
// values into the cached entry, so a caller replacing its row keeps the rest.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { mediaItemQueryKey } from "./useMediaItem";
import { splitPersonal, useStatusToggle } from "./useStatusToggle";

const ANSWERS = {
  "/api/me/list/a1": { media_id: "a1", media_type: "anime", watching_status: "Completed", ep_fin: 12 },
  "/api/me/plan-flags/a1": { watch_next: true },
  "/api/anime/a1": { system_id: "a1", anime_name_en: "Frieren", airing_status: "Finished Airing" },
};

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn((url) =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(ANSWERS[url] ?? {}) }),
    ),
  );
}

function renderToggle() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(mediaItemQueryKey("anime", "a1"), {
    system_id: "a1",
    anime_name_en: "Frieren",
    watching_status: "Watching",
  });
  const wrapper = ({ children }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useStatusToggle("anime"), { wrapper });
}

const calls = () => fetch.mock.calls.map(([url, o]) => [url, o.method, JSON.parse(o.body)]);

afterEach(() => vi.unstubAllGlobals());

describe("splitPersonal", () => {
  it("parts the plan flags from the list fields", () => {
    expect(splitPersonal({ watching_status: "Watching", watch_next: 1, ep_fin: 3 })).toEqual({
      list: { watching_status: "Watching", ep_fin: 3 },
      planFlags: { watch_next: true },
    });
  });
});

describe("useStatusToggle", () => {
  it("writes a status to /api/me/list and keeps the cached catalogue half", async () => {
    stubFetch();
    const { result } = renderToggle();
    let updated;
    await act(async () => {
      updated = await result.current.mutateAsync({ id: "a1", value: "Completed" });
    });
    expect(calls()).toEqual([["/api/me/list/a1", "PUT", { watching_status: "Completed" }]]);
    expect(updated).toMatchObject({ anime_name_en: "Frieren", watching_status: "Completed", ep_fin: 12 });
    expect(updated).not.toHaveProperty("media_type");
  });

  it("writes a plan flag to /api/me/plan-flags and nothing else", async () => {
    stubFetch();
    const { result } = renderToggle();
    await act(async () => {
      await result.current.mutateAsync({ id: "a1", value: true, field: "watch_next" });
    });
    expect(calls()).toEqual([["/api/me/plan-flags/a1", "PUT", { watch_next: true }]]);
  });

  it("folds the saved values into an entry the caller holds", async () => {
    stubFetch();
    const { result } = renderToggle();
    let updated;
    await act(async () => {
      updated = await result.current.mutateAsync({
        id: "a1",
        fields: { watching_status: "Completed" },
        entry: { system_id: "a1", anime_name_en: "Held Title", watching_status: "Watching" },
      });
    });
    expect(updated).toMatchObject({ anime_name_en: "Held Title", watching_status: "Completed", ep_fin: 12 });
  });

  it("sends only an explicit catalogue payload to the entry PATCH", async () => {
    stubFetch();
    const { result } = renderToggle();
    let updated;
    await act(async () => {
      updated = await result.current.mutateAsync({
        id: "a1",
        fields: { watching_status: "Completed" },
        catalogue: { airing_status: "Finished Airing" },
      });
    });
    expect(calls()).toEqual([
      ["/api/anime/a1", "PATCH", { airing_status: "Finished Airing" }],
      ["/api/me/list/a1", "PUT", { watching_status: "Completed" }],
    ]);
    expect(updated).toMatchObject({ airing_status: "Finished Airing", watching_status: "Completed" });
  });
});
