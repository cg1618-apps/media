import { describe, expect, it } from "vitest";

import { ownerKeyOf, orderEditPath } from "./orderPaths";

describe("ownerKeyOf", () => {
  it.each([
    [{ franchise_id: "FR001" }, "franchise:FR001"],
    [{ series_id: "SE001" }, "series:SE001"],
    [{ collection_id: "CO001" }, "collection:CO001"],
    [{}, "unknown"],
  ])("keys %o as %s", (list, key) => {
    expect(ownerKeyOf(list)).toBe(key);
  });
});

describe("orderEditPath", () => {
  const read = (path) => Object.fromEntries(new URL(path, "http://x").searchParams);

  it("carries the owner and the order", () => {
    expect(read(orderEditPath("franchise:FR001", "L1"))).toEqual({
      owner: "franchise:FR001",
      order: "L1",
    });
  });

  it("carries the owner alone when no order is open", () => {
    expect(read(orderEditPath("series:SE001", null))).toEqual({
      owner: "series:SE001",
    });
  });

  it("drops an unknown owner rather than putting it in the URL", () => {
    expect(orderEditPath("unknown", "L1")).toBe("/orders?order=L1");
  });
});
