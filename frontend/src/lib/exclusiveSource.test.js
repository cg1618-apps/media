import { describe, expect, it } from "vitest";

import { exclusiveSourceProblem } from "./exclusiveSource";
import { buildAnimeMoviePayload, buildAnimePayload } from "./payloads";

const netflix = (patch = {}) => ({
  kind: "access",
  bucket: "main",
  name: "Netflix",
  url: "",
  available: true,
  ...patch,
});

describe("exclusiveSourceProblem", () => {
  it("is null with no exclusive source", () => {
    expect(exclusiveSourceProblem({ exclusive_source: "", sources: [] })).toBeNull();
    // Not loaded yet (Modify before the credits arrive): nothing to check.
    expect(exclusiveSourceProblem({ sources: [] })).toBeNull();
  });

  it("is null when an available main access row names the platform", () => {
    expect(
      exclusiveSourceProblem({ exclusive_source: "Netflix", sources: [netflix()] }),
    ).toBeNull();
  });

  it.each([
    ["no rows", []],
    ["an unavailable row", [netflix({ available: false })]],
    ["an unknown availability", [netflix({ available: null })]],
    ["an Other Sources row", [netflix({ bucket: "other" })]],
    ["a reference row", [netflix({ kind: "reference" })]],
    ["another platform", [netflix({ name: "Crunchyroll" })]],
  ])("names the platform with %s", (_label, sources) => {
    const problem = exclusiveSourceProblem({ exclusive_source: "Netflix", sources });
    expect(problem).toMatch(/Netflix/);
    expect(problem).toMatch(/Main Sources/);
  });
});

describe("the exclusive source in the entry payload", () => {
  it("rides with the sources on anime and anime movie", () => {
    const form = { exclusive_source: "Netflix", sources: [netflix()] };
    expect(buildAnimePayload(form).exclusive_source).toBe("Netflix");
    expect(buildAnimeMoviePayload(form).exclusive_source).toBe("Netflix");
  });

  it("is null when blank, so the save clears it", () => {
    expect(buildAnimePayload({ exclusive_source: "" }).exclusive_source).toBeNull();
  });

  it("is left out while the form has not loaded it", () => {
    // Modify fills it from the credits GET; a save before that must not
    // clear a value it never saw.
    expect("exclusive_source" in buildAnimePayload({})).toBe(false);
    expect("exclusive_source" in buildAnimeMoviePayload({})).toBe(false);
  });
});
