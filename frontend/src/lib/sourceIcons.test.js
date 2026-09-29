import { describe, expect, it } from "vitest";

import { SOURCE_ICON_NAMES, sourceIconUrl } from "./sourceIcons";

describe("sourceIconUrl", () => {
  // A mistyped slug would otherwise just drop that site's icon, silently.
  it("resolves every listed name to a bundled file", () => {
    const missing = SOURCE_ICON_NAMES.filter((name) => !sourceIconUrl(name));
    expect(missing).toEqual([]);
  });

  it("shares one icon across a site's regional variants", () => {
    expect(sourceIconUrl("DLsite TW")).toBe(sourceIconUrl("DLsite"));
    expect(sourceIconUrl("Lezhin KR")).toBe(sourceIconUrl("Lezhin"));
  });

  it("has no icon for a generic or unknown name", () => {
    expect(sourceIconUrl("Official site")).toBeNull();
    expect(sourceIconUrl("Cinema")).toBeNull();
    expect(sourceIconUrl("Some new platform")).toBeNull();
    expect(sourceIconUrl(undefined)).toBeNull();
  });
});
