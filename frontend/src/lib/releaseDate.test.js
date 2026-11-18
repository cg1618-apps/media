import { describe, it, expect } from "vitest";
import {
  earliestUpcomingReleaseDate,
  isUpcomingReleaseDate,
  isValidReleaseDate,
  formatReleaseDate,
  primaryReleaseValue,
  todayIso,
} from "./releaseDate";

describe("isValidReleaseDate", () => {
  it("accepts the three legal shapes", () => {
    expect(isValidReleaseDate("2024")).toBe(true);
    expect(isValidReleaseDate("2024-05")).toBe(true);
    expect(isValidReleaseDate("2024-05-17")).toBe(true);
  });

  it("treats an empty value as valid so a blank field is not an error", () => {
    expect(isValidReleaseDate("")).toBe(true);
    expect(isValidReleaseDate(null)).toBe(true);
  });

  it("rejects malformed shapes", () => {
    expect(isValidReleaseDate("24")).toBe(false);
    expect(isValidReleaseDate("2024-5")).toBe(false);
    expect(isValidReleaseDate("JUL 2001")).toBe(false);
    expect(isValidReleaseDate("2024/05/17")).toBe(false);
  });

  it("rejects calendar-impossible values", () => {
    expect(isValidReleaseDate("2024-13")).toBe(false);
    expect(isValidReleaseDate("2024-02-30")).toBe(false);
    expect(isValidReleaseDate("2023-02-29")).toBe(false);
  });

  it("accepts a real leap day", () => {
    expect(isValidReleaseDate("2024-02-29")).toBe(true);
  });
});

describe("formatReleaseDate", () => {
  it("shows the stored value verbatim, never inventing precision", () => {
    expect(formatReleaseDate("2024")).toBe("2024");
    expect(formatReleaseDate("2024-05")).toBe("2024-05");
    expect(formatReleaseDate("2024-05-17")).toBe("2024-05-17");
  });

  it("shows TBA when there is nothing stored", () => {
    expect(formatReleaseDate("")).toBe("TBA");
    expect(formatReleaseDate(null)).toBe("TBA");
  });
});

describe("primaryReleaseValue", () => {
  it("reads an anime's JP date first, then its TW one", () => {
    expect(
      primaryReleaseValue("anime", { release_date_jp: "2024-04", release_date_tw: "2024-05" }),
    ).toBe("2024-04");
    expect(primaryReleaseValue("anime", { release_date_tw: "2024-05" })).toBe("2024-05");
    expect(primaryReleaseValue("anime", { release_date: "2020" })).toBeNull();
  });
});

describe("isUpcomingReleaseDate", () => {
  const today = "2026-11-17";

  it("keeps a date that is today or later", () => {
    expect(isUpcomingReleaseDate("2026-11-17", today)).toBe(true);
    expect(isUpcomingReleaseDate("2027-01-05", today)).toBe(true);
  });

  it("drops a date that has passed", () => {
    expect(isUpcomingReleaseDate("2026-11-16", today)).toBe(false);
    expect(isUpcomingReleaseDate("2020", today)).toBe(false);
  });

  it("keeps a partial date until the period it names is over", () => {
    expect(isUpcomingReleaseDate("2026-11", today)).toBe(true);
    expect(isUpcomingReleaseDate("2026", today)).toBe(true);
    expect(isUpcomingReleaseDate("2026-10", today)).toBe(false);
  });

  it("is never true of an empty or malformed value", () => {
    expect(isUpcomingReleaseDate("", today)).toBe(false);
    expect(isUpcomingReleaseDate(null, today)).toBe(false);
    expect(isUpcomingReleaseDate("soon", today)).toBe(false);
  });
});

describe("earliestUpcomingReleaseDate", () => {
  it("picks the earliest date still ahead, skipping passed and empty ones", () => {
    expect(
      earliestUpcomingReleaseDate(["2025-01", null, "2027-06", "2027-02-01"], "2026-11-17"),
    ).toBe("2027-02-01");
  });

  it("is null when nothing is ahead", () => {
    expect(earliestUpcomingReleaseDate(["2025-01", ""], "2026-11-17")).toBeNull();
  });
});

describe("todayIso", () => {
  it("formats the local calendar date", () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });
});
