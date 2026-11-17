import { describe, expect, it } from "vitest";

import { orderNoun } from "./orderNoun";

describe("orderNoun", () => {
  it("calls the feature Play Order for a game only", () => {
    expect(orderNoun("game")).toBe("Play Order");
    // Mirror: h-game is a game too, and keeps the default name.
    expect(orderNoun("h-game")).toBe("Watch Order");
    expect(orderNoun("anime")).toBe("Watch Order");
    expect(orderNoun(undefined)).toBe("Watch Order");
  });
});
