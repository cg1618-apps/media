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

  it("breaks a rating tie by title", () => {
    expect(names(sortBy(rows, "my_rating"))).toEqual([
      "Charlie",
      "Echo",
      "Alpha",
      "Delta",
      "Bravo",
    ]);
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
