// Frontend: every library config marks its viewer's-own defs `personal`.
//
// LibraryLayout drops the personal defs for a viewer without self.list, so a
// def that forgets the flag is shown to a guest as an empty filter, sort or
// column. These iterate the registry, so a config added later is held to
// the same rule without anyone remembering to add it here.
import { describe, expect, it } from "vitest";

import { LIBRARY_CONFIGS } from "./index";

const STATUS_FILTER_KEYS = ["watchingStatus", "readingStatus", "playingStatus"];

describe.each(Object.entries(LIBRARY_CONFIGS))("the %s library config", (_type, config) => {
  it("marks its status-group filter personal", () => {
    const statusFilters = config.filterDefs.filter((fd) => STATUS_FILTER_KEYS.includes(fd.key));
    expect(statusFilters).toHaveLength(1);
    expect(statusFilters[0].personal).toBe(true);
  });

  it("marks its my-rating sort personal", () => {
    const sort = config.sortDefs.find((s) => s.key === "my_rating");
    expect(sort?.personal).toBe(true);
  });

  it("marks its status, my-rating and plan-flag columns personal", () => {
    const columns = config.tableColumns.filter(
      (col) => col.statusField || col.key === "my" || /_next$|^to_re/.test(col.key),
    );
    expect(columns.length).toBeGreaterThan(1);
    for (const col of columns) expect(col.personal).toBe(true);
  });

  // The mirror: a config with nothing left for a guest would be a page of
  // nothing, which is the shape a blanket `personal` would produce.
  it("keeps a catalogue sort and column for a viewer without a list", () => {
    expect(config.sortDefs.some((s) => !s.personal)).toBe(true);
    expect(config.tableColumns.filter((c) => !c.personal).length).toBeGreaterThan(1);
  });
});
