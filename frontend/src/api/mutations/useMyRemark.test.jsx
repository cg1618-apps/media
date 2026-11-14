// The caller's own remark: what goes over the wire, and how an answer lands
// back in the row a page holds.
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useMyRemarkSaver, useSaveMyRemark } from "./useMyRemark";
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

describe("useSaveMyRemark", () => {
  it("PUTs {remark} to /api/me/remarks/{owner_type}/{owner_id}", async () => {
    global.fetch = vi.fn(() => okJson({ remark: "Rewatch." }));
    const { result } = renderHook(() => useSaveMyRemark(), {
      wrapper: wrapperWith(new QueryClient()),
    });

    await act(() =>
      result.current.mutateAsync({ ownerType: "anime-movie", ownerId: "M1", remark: "Rewatch." }),
    );

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/me/remarks/anime-movie/M1");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ remark: "Rewatch." });
  });

  it("sends an emptied remark as null", async () => {
    global.fetch = vi.fn(() => okJson({ remark: null }));
    const { result } = renderHook(() => useSaveMyRemark(), {
      wrapper: wrapperWith(new QueryClient()),
    });

    await act(() =>
      result.current.mutateAsync({ ownerType: "series", ownerId: "S1", remark: "" }),
    );

    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ remark: null });
  });

  it("invalidates the entry and the lists that show the value", async () => {
    global.fetch = vi.fn(() => okJson({ remark: "x" }));
    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useSaveMyRemark(), {
      wrapper: wrapperWith(queryClient),
    });

    await act(() =>
      result.current.mutateAsync({ ownerType: "manga", ownerId: "G1", remark: "x" }),
    );

    const keys = spy.mock.calls.map(([arg]) => arg.queryKey);
    expect(keys).toContainEqual(["media-item", "manga"]);
    expect(keys).toContainEqual(["media-list", "manga"]);
  });
});

describe("useMyRemarkSaver", () => {
  it("folds the saved remark into the row", async () => {
    global.fetch = vi.fn(() => okJson({ remark: "Saved text." }));
    let row = { system_id: "F1", remark: "Old.", franchise_name_en: "Kept" };
    const setRow = vi.fn((update) => {
      row = update(row);
    });
    const { result } = renderHook(() => useMyRemarkSaver("franchise", "F1", setRow), {
      wrapper: wrapperWith(new QueryClient()),
    });

    let saved;
    await act(async () => {
      saved = await result.current("Saved text.");
    });

    expect(saved).toBe("Saved text.");
    expect(row).toEqual({ system_id: "F1", remark: "Saved text.", franchise_name_en: "Kept" });
  });

  it("leaves the row as it was when the save fails", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        json: () => Promise.resolve({ detail: "Not permitted" }),
      }),
    );
    const setRow = vi.fn();
    const { result } = renderHook(() => useMyRemarkSaver("anime", "A1", setRow), {
      wrapper: wrapperWith(new QueryClient()),
    });

    let saved;
    await act(async () => {
      saved = await result.current("Anything.");
    });

    expect(saved).toBeUndefined();
    expect(setRow).not.toHaveBeenCalled();
  });
});
