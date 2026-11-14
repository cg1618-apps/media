// The watch order page's status and importance colours - design rule 5's
// third exception (docs/frontend/design-system.md).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  PLAYING_STATUSES,
  READING_STATUSES,
  WATCHING_STATUSES,
} from "./fieldOptions";
import { IMPORTANCE_CHIPS, STATUS_TONES, statusChip } from "./watchOrderColors";

const PALETTE =
  /(?:bg|text|border)-(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+/;

describe("watch order status colours", () => {
  it("gives every watching, reading and playing status a tone", () => {
    // The variants count: "Completed (解說)" must not fall back to ink.
    const all = new Set([...WATCHING_STATUSES, ...READING_STATUSES, ...PLAYING_STATUSES]);
    for (const status of all) {
      expect(STATUS_TONES[status], status).toBeDefined();
    }
    expect(Object.keys(STATUS_TONES).sort()).toEqual([...all].sort());
  });

  it("maps each bucket to the tone it was asked for", () => {
    expect(STATUS_TONES["Completed"]).toBe("success");
    expect(STATUS_TONES["Completed (解說)"]).toBe("success");
    expect(STATUS_TONES["Active Watching"]).toBe("warning");
    expect(STATUS_TONES["Passive Reading"]).toBe("warning");
    expect(STATUS_TONES["Paused"]).toBe("info");
    expect(STATUS_TONES["Dropped"]).toBe("danger");
    // Set aside, not given up: blue like Paused, though the library filters
    // group it with Dropped.
    expect(STATUS_TONES["Temp Dropped"]).toBe("info");
    expect(STATUS_TONES["Won't Play"]).toBe("danger");
    expect(STATUS_TONES["Plan to Watch"]).toBe("muted");
    expect(STATUS_TONES["Might Read"]).toBe("muted");
  });

  it("returns null for a status it does not know, so the ink chip stays", () => {
    expect(statusChip("Rewatching")).toBeNull();
    expect(statusChip(null)).toBeNull();
  });

  it("draws every chip from tokens, never a palette colour or a hex", () => {
    const chips = [
      ...new Set(Object.keys(STATUS_TONES).map(statusChip)),
      ...Object.values(IMPORTANCE_CHIPS),
    ];
    for (const chip of chips) {
      expect(chip).not.toMatch(PALETTE);
      expect(chip).not.toMatch(/#[0-9a-f]{3,8}/i);
    }
  });

  it("sets state chip text in the theme-aware token, defined in all three palettes", () => {
    const css = readFileSync(join(process.cwd(), "src", "index.css"), "utf8");
    for (const tone of ["success", "warning", "info", "danger"]) {
      const chip = statusChip(Object.keys(STATUS_TONES).find((s) => STATUS_TONES[s] === tone));
      expect(chip).toContain(`text-state-${tone}`);
      expect(css).toContain(`--color-state-${tone}: var(--c-state-${tone});`);
      // A token missing from one palette renders as nothing in that theme -
      // the prefers-color-scheme block is the one that is easy to forget.
      const defs = css.split(`--c-state-${tone}: hsl(`).length - 1;
      expect(defs, tone).toBe(3);
    }
  });

  it("colours importance: Essential strong brand, Recommended the tint, no Normal", () => {
    expect(IMPORTANCE_CHIPS.Essential).toContain("bg-brand ");
    expect(IMPORTANCE_CHIPS.Essential).toContain("text-on-brand");
    expect(IMPORTANCE_CHIPS.Recommended).toContain("bg-brand-soft");
    expect(IMPORTANCE_CHIPS.Optional).toContain("text-text-muted");
    expect(IMPORTANCE_CHIPS.Normal).toBeUndefined();
  });
});
