// Frontend: unit tests for the Data Control Log Details popup's readers.
import { describe, expect, it } from "vitest";

import { formatLogDuration, logDetailSections } from "./logDetails";

describe("logDetailSections", () => {
  it("draws nothing for a row with no details", () => {
    expect(logDetailSections(null)).toEqual([]);
    expect(logDetailSections("")).toEqual([]);
  });

  it("draws a Pull All's created entities and skipped tabs, not its totals", () => {
    const sections = logDetailSections(
      JSON.stringify({
        pulled: { Anime: 3 },
        created_entities: ["Studio: Madhouse"],
        skipped_tabs: ["Users: skipped"],
      }),
    );
    expect(sections).toEqual([
      { key: "created_entities", label: "Created from the sheet", lines: ["Studio: Madhouse"] },
      { key: "skipped_tabs", label: "Skipped tabs", lines: ["Users: skipped"] },
    ]);
  });

  it("puts failed entries first and leaves empty lists out", () => {
    const sections = logDetailSections(
      JSON.stringify({ created_entities: [], failed: ["Bad Movie"] }),
    );
    expect(sections.map((s) => s.key)).toEqual(["failed"]);
  });

  it("draws a count map one line per count, and a string as one line", () => {
    const [cast, note] = logDetailSections(
      JSON.stringify({
        cast: { cast_role: 2, cast_seiyuu: 0 },
        no_installation_owner: "3 row(s) skipped",
      }),
    ).sort((a, b) => a.key.localeCompare(b.key));
    expect(cast.lines).toEqual(["Cast role: 2", "Cast seiyuu: 0"]);
    expect(note.lines).toEqual(["3 row(s) skipped"]);
  });

  it("draws a key it does not know under its own name", () => {
    expect(logDetailSections(JSON.stringify({ per_tab: { Anime: 1 } }))).toEqual([
      { key: "per_tab", label: "Per tab", lines: ["Anime: 1"] },
    ]);
  });

  it("draws text that is not JSON as it is", () => {
    expect(logDetailSections("plain words")).toEqual([
      { key: "raw", label: "Details", lines: ["plain words"] },
    ]);
  });
});

describe("formatLogDuration", () => {
  it("is a dash for a row with no start", () => {
    expect(formatLogDuration(null, "2026-11-26T10:00:00")).toBe("-");
  });

  it("reads seconds, minutes and hours", () => {
    const start = "2026-11-26T10:00:00";
    expect(formatLogDuration(start, "2026-11-26T10:00:45")).toBe("45s");
    expect(formatLogDuration(start, "2026-11-26T10:03:12")).toBe("3m 12s");
    expect(formatLogDuration(start, "2026-11-26T11:04:00")).toBe("1h 4m");
  });
});
