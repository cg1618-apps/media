// Frontend: catalogueOnly drops the personal defs of a library config, and
// libraryConfigFor leaves a list holder's config whole.
import { describe, expect, it } from "vitest";

import { catalogueOnly, libraryConfigFor, resolveSortKey } from "./libraryScope";

const keys = (defs) => defs.map((d) => d.key);

function config(overrides = {}) {
  return {
    navPath: "/thing",
    defaultSort: "title",
    filterDefs: [
      { key: "airingStatus", type: "set" },
      { key: "watchingStatus", type: "set-grouped", personal: true },
    ],
    sortDefs: [
      { key: "title" },
      { key: "my_rating", personal: true },
      { key: "mal_rating" },
    ],
    tableColumns: [
      { key: "title" },
      { key: "ep", personal: true },
      { key: "mal" },
      { key: "watch", personal: true },
    ],
    ...overrides,
  };
}

describe("catalogueOnly", () => {
  it("keeps only the catalogue filter, sort and column defs", () => {
    const scoped = catalogueOnly(config());
    expect(keys(scoped.filterDefs)).toEqual(["airingStatus"]);
    expect(keys(scoped.sortDefs)).toEqual(["title", "mal_rating"]);
    expect(keys(scoped.tableColumns)).toEqual(["title", "mal"]);
    expect(scoped.defaultSort).toBe("title");
    expect(scoped.navPath).toBe("/thing");
  });

  it("falls back to the first remaining sort when the default is personal", () => {
    const scoped = catalogueOnly(
      config({
        defaultSort: "my_rating",
        sortDefs: [{ key: "my_rating", personal: true }, { key: "mal_rating" }, { key: "title" }],
      }),
    );
    expect(scoped.defaultSort).toBe("mal_rating");
  });

  it("does not touch the config it is given", () => {
    const original = config();
    catalogueOnly(original);
    expect(original.filterDefs).toHaveLength(2);
    expect(original.sortDefs).toHaveLength(3);
    expect(original.tableColumns).toHaveLength(4);
  });
});

describe("libraryConfigFor", () => {
  it("with a list of its own, the viewer keeps every def", () => {
    const original = config({ defaultSort: "my_rating" });
    const scoped = libraryConfigFor(original, true);
    expect(scoped).toBe(original);
    expect(scoped.defaultSort).toBe("my_rating");
  });

  it("without one, the viewer gets the catalogue parts only", () => {
    const scoped = libraryConfigFor(config(), false);
    expect(keys(scoped.sortDefs)).not.toContain("my_rating");
  });
});

describe("resolveSortKey", () => {
  it("keeps an offered key and replaces one that is not offered", () => {
    const sortDefs = [{ key: "title" }, { key: "mal_rating" }];
    expect(resolveSortKey(sortDefs, "mal_rating")).toBe("mal_rating");
    expect(resolveSortKey(sortDefs, "my_rating")).toBe("title");
  });
});
