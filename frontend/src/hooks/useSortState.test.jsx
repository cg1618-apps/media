import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useSortState } from "./useSortState";

describe("useSortState", () => {
  it("starts on the default sort in its natural direction", () => {
    const { result } = renderHook(() => useSortState("title"));
    expect(result.current.sort).toBe("title");
    expect(result.current.reversed).toBe(false);
  });

  it("keeps the direction for the sort it was set on, and resets it on a new sort", () => {
    const { result } = renderHook(() => useSortState("title"));
    act(() => result.current.setReversed(true));
    expect(result.current.reversed).toBe(true);
    act(() => result.current.setSort("title"));
    expect(result.current.reversed).toBe(true);
    act(() => result.current.setSort("my_rating"));
    expect(result.current).toMatchObject({ sort: "my_rating", reversed: false });
  });
});
