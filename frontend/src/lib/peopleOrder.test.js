import { describe, expect, it } from "vitest";

import { byRatingThenAppearances } from "./peopleOrder";

const person = (id, my_rating, credit_count) => ({ id, my_rating, credit_count });

describe("byRatingThenAppearances", () => {
  it("puts the best rating first and unrated last", () => {
    const people = [person("b", "B"), person("none", null), person("s", "S"), person("aplus", "A+")];
    expect(byRatingThenAppearances(people).map((p) => p.id)).toEqual(["s", "aplus", "b", "none"]);
  });

  it("breaks a rating tie by the most appearances", () => {
    const people = [person("few", "A", 2), person("many", "A", 40), person("none", "A")];
    expect(byRatingThenAppearances(people).map((p) => p.id)).toEqual(["many", "few", "none"]);
  });

  it("leaves the input untouched", () => {
    const people = [person("b", "B"), person("s", "S")];
    byRatingThenAppearances(people);
    expect(people.map((p) => p.id)).toEqual(["b", "s"]);
  });
});
