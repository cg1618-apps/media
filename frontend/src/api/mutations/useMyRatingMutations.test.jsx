// The caller's own rating and expectation: what goes over the wire, and how an
// answer lands back in the row a page holds.
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyMyRating,
  useMyRatingSaver,
  useSaveMyNovelUnit,
  useSaveMyRating,
} from "./useMyRatingMutations";
import { ToastProvider } from "../../hooks/useToast";

function wrapperWith(queryClient) {
  return function Wrapper({ children }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
  };
}

function okJson(body) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
}

afterEach(() => vi.restoreAllMocks());

describe("useSaveMyRating", () => {
  it("PUTs the partial body to /api/me/ratings/{owner_type}/{owner_id}", async () => {
    global.fetch = vi.fn(() =>
      okJson({ owner_type: "franchise", owner_id: "F1", my_rating: "A", expectation: null }),
    );
    const queryClient = new QueryClient();
    const { result } = renderHook(() => useSaveMyRating(), {
      wrapper: wrapperWith(queryClient),
    });

    await act(() =>
      result.current.mutateAsync({
        ownerType: "franchise",
        ownerId: "F1",
        data: { my_rating: "A" },
      }),
    );

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/me/ratings/franchise/F1");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ my_rating: "A" });
  });

  it("invalidates the lists and the search that show the value", async () => {
    global.fetch = vi.fn(() =>
      okJson({ owner_type: "series", owner_id: "S1", my_rating: null, expectation: "High" }),
    );
    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useSaveMyRating(), {
      wrapper: wrapperWith(queryClient),
    });

    await act(() =>
      result.current.mutateAsync({
        ownerType: "series",
        ownerId: "S1",
        data: { expectation: "High" },
      }),
    );

    const keys = spy.mock.calls.map(([arg]) => arg.queryKey);
    expect(keys).toContainEqual(["media-list", "series"]);
    expect(keys).toContainEqual(["api", "search"]);
  });
});

describe("useMyRatingSaver", () => {
  it("folds the answer into the row under the row's own field names", async () => {
    global.fetch = vi.fn(() =>
      okJson({ owner_type: "collection", owner_id: "C1", my_rating: "S", expectation: "Low" }),
    );
    let row = { system_id: "C1", my_rating: null, collection_expectation: null, name: "x" };
    const setRow = (fn) => {
      row = fn(row);
    };
    const { result } = renderHook(() => useMyRatingSaver("collection", "C1", setRow), {
      wrapper: wrapperWith(new QueryClient()),
    });

    await act(() => result.current({ my_rating: "S" }));

    await waitFor(() =>
      expect(row).toEqual({
        system_id: "C1",
        my_rating: "S",
        collection_expectation: "Low",
        name: "x",
      }),
    );
  });
});

describe("applyMyRating", () => {
  it("leaves an entity's row without an expectation field", () => {
    const row = applyMyRating(
      { system_id: "P1", my_rating: "B" },
      { owner_type: "person", owner_id: "P1", my_rating: null, expectation: null },
    );
    expect(row).toEqual({ system_id: "P1", my_rating: null });
  });
});

describe("useSaveMyNovelUnit", () => {
  it("PUTs the partial body to /api/me/novel-units/{unit_id}", async () => {
    global.fetch = vi.fn(() => okJson({ unit_id: "U1", my_rating: null, remark: "x" }));
    const { result } = renderHook(() => useSaveMyNovelUnit("N1"), {
      wrapper: wrapperWith(new QueryClient()),
    });

    await act(() => result.current.mutateAsync({ unitId: "U1", data: { remark: "x" } }));

    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/me/novel-units/U1");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ remark: "x" });
  });
});
