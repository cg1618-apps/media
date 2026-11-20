// Frontend: a studio's countries between the API's list and the form's text.
import { describe, expect, it } from "vitest";

import {
  countriesPayload,
  countriesToForm,
  formatCountries,
  splitCountries,
} from "./countries";

describe("countries", () => {
  it("splits form text into trimmed names, dropping blanks and repeats", () => {
    expect(splitCountries(" Japan, ,China, japan ")).toEqual(["Japan", "China"]);
    expect(splitCountries("")).toEqual([]);
    expect(splitCountries(undefined)).toEqual([]);
  });

  it("posts null when no country is named, never []", () => {
    expect(countriesPayload(" , ")).toBeNull();
    expect(countriesPayload("Japan, China")).toEqual(["Japan", "China"]);
  });

  it("turns a stored list into form text and back", () => {
    expect(countriesToForm(["Japan", "China"])).toBe("Japan, China");
    expect(countriesToForm(null)).toBe("");
    expect(countriesPayload(countriesToForm(["Japan", "China"]))).toEqual(["Japan", "China"]);
  });

  it("joins a list for display", () => {
    expect(formatCountries(["Japan", "USA"])).toBe("Japan, USA");
    expect(formatCountries(null)).toBe("");
  });
});
