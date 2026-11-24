import { describe, expect, it } from "vitest";

import { compareGroups, getExpectationWeight } from "./groupSort";

const f = (name, expectation, rating) => ({
  franchise_name_en: name,
  franchise_expectation: expectation,
  my_rating: rating,
});

const names = (rows) => rows.map((r) => r.franchise_name_en);
const sortBy = (rows, sort) =>
  [...rows].sort((a, b) => compareGroups(a, b, sort, "franchise"));

describe("getExpectationWeight", () => {
  it("orders Highest first and an unset expectation last", () => {
    const order = ["Low", null, "Highest", "Medium", "High"].sort(
      (a, b) => getExpectationWeight(a) - getExpectationWeight(b),
    );
    expect(order).toEqual(["Highest", "High", "Medium", "Low", null]);
  });
});

describe("compareGroups", () => {
  const rows = [
    f("Delta", "High", "B"),
    f("Alpha", "High", "B"),
    f("Charlie", "High", "S"),
    f("Bravo", "Highest", null),
    f("Echo", null, "S"),
  ];

  it("breaks an expectation tie by my rating, then by title", () => {
    expect(names(sortBy(rows, "expectation"))).toEqual([
      "Bravo",
      "Charlie",
      "Alpha",
      "Delta",
      "Echo",
    ]);
  });

  it("breaks a rating tie by expectation, then by title", () => {
    expect(names(sortBy(rows, "my_rating"))).toEqual([
      "Charlie",
      "Echo",
      "Alpha",
      "Delta",
      "Bravo",
    ]);
  });

  it("lets the expectation overrule the title inside a rating tie", () => {
    // Title alone would put Able first; the expectation must win.
    const tied = [f("Able", "Low", "A"), f("Zulu", "Highest", "A"), f("Mike", null, "A")];
    expect(names(sortBy(tied, "my_rating"))).toEqual(["Zulu", "Able", "Mike"]);
  });

  it("lets the rating overrule the title inside an expectation tie", () => {
    const tied = [f("Able", "High", "C"), f("Zulu", "High", "S"), f("Mike", "High", null)];
    expect(names(sortBy(tied, "expectation"))).toEqual(["Zulu", "Able", "Mike"]);
  });

  it("sorts by title alone", () => {
    expect(names(sortBy(rows, "title"))).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
      "Delta",
      "Echo",
    ]);
  });

  it("reads each tier's own expectation field", () => {
    const series = [
      { series_name_en: "B", series_expectation: "Low" },
      { series_name_en: "A", series_expectation: "Highest" },
    ];
    const sorted = [...series].sort((a, b) =>
      compareGroups(a, b, "expectation", "series"),
    );
    expect(sorted.map((s) => s.series_name_en)).toEqual(["A", "B"]);
  });
});

describe("compareGroups on a collection", () => {
  it("reads collection_expectation as a rating tie-break", () => {
    const rows = [
      { collection_name_en: "A", collection_expectation: "Low", my_rating: "S" },
      { collection_name_en: "B", collection_expectation: "High", my_rating: "S" },
    ];
    const sorted = [...rows].sort((a, b) => compareGroups(a, b, "my_rating", "collection"));
    expect(sorted.map((r) => r.collection_name_en)).toEqual(["B", "A"]);
  });
});
