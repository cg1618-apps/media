// useViewScope: which member-only surfaces the viewer may see. `ownData` is the
// viewer's own opinion of catalogue rows - its ratings and expectations, a
// novel unit's remark - and answers self.list, not view.personal.
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useViewScope } from "./useViewScope";

let held = [];
vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ has: (p) => held.includes(p) }),
}));

describe("useViewScope", () => {
  it("ownData is true for a viewer holding self.list", () => {
    held = ["self.list"];
    expect(renderHook(() => useViewScope()).result.current.ownData).toBe(true);
  });

  it("ownData is false without self.list, even holding view.personal", () => {
    held = ["view.personal"];
    const { result } = renderHook(() => useViewScope());
    expect(result.current.ownData).toBe(false);
    expect(result.current.personal).toBe(true);
  });
});
