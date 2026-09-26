import { describe, expect, it } from "vitest";

import { defaultHentai } from "../config/formFactories";
import { HENTAI_RESTRICTED_SOURCES, defaultHentaiSources } from "./hentaiRestrictedSources";

describe("hentai restricted sources", () => {
  it("suggests Hanime1", () => {
    expect(HENTAI_RESTRICTED_SOURCES).toEqual(["Hanime1"]);
  });

  it("starts every new hentai with an untouched Hanime1 restricted row", () => {
    expect(defaultHentai().sources).toEqual([
      { kind: "access", bucket: "restricted", name: "Hanime1", url: "", available: null },
    ]);
  });

  it("hands each form its own rows, so editing one cannot change the next", () => {
    const first = defaultHentaiSources();
    first[0].url = "https://example.test";
    expect(defaultHentaiSources()[0].url).toBe("");
  });
});
