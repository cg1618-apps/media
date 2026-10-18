import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { MEDIA_TYPES } from "./fieldOptions";
import { USAGES } from "../components/forms/UsagePicker";
import {
  SCOPE_CHIPS,
  scopeChip,
  TYPE_HUES,
  typeHue,
  USAGE_CHIPS,
  usageChip,
} from "./scopeColors";

describe("scope chip colours", () => {
  it("covers every media type key the scope picker offers", () => {
    expect(Object.keys(SCOPE_CHIPS).sort()).toEqual([...MEDIA_TYPES].sort());
  });

  it("gives each media type a distinct chip", () => {
    const chips = MEDIA_TYPES.map(scopeChip);
    expect(new Set(chips).size).toBe(MEDIA_TYPES.length);
  });

  it("draws its colour from scope tokens, never a raw palette colour", () => {
    // Design rule: "New colour -> add a token to index.css in both palettes,
    // never a raw hex in a component." A Tailwind palette utility here would
    // also break rule 1 and would be tuned for a white page, not bone paper.
    const PALETTE =
      /(?:bg|text|border)-(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+/;
    for (const chip of Object.values(SCOPE_CHIPS)) {
      expect(chip).toMatch(/bg-scope-[a-z-]+\/\d+/);
      expect(chip).toMatch(/border-scope-[a-z-]+\/\d+/);
      expect(chip).toMatch(/text-scope-[a-z-]+(?!\/)/);
      expect(chip).not.toMatch(PALETTE);
      expect(chip).not.toMatch(/#[0-9a-f]{3,8}/i);
    }
  });

  it("colours a media type the same in the scope column and the search badge", () => {
    for (const type of MEDIA_TYPES) {
      expect(scopeChip(type)).toContain(typeHue(type));
    }
  });

  it("gives every searchable type a distinct hue drawn from scope tokens", () => {
    const hues = Object.values(TYPE_HUES);
    expect(new Set(hues).size).toBe(hues.length);
    for (const hue of hues) {
      expect(hue).toMatch(/^bg-scope-[a-z-]+\/12 border-scope-[a-z-]+\/40 text-scope-[a-z-]+$/);
    }
    expect(typeHue("holodeck")).toBeNull();
  });

  it("defines every hue's token in all three palettes", () => {
    // A token missing from one palette renders as nothing in that theme -
    // the prefers-color-scheme block is the one that is easy to forget.
    const css = readFileSync(join(process.cwd(), "src", "index.css"), "utf8");
    for (const type of Object.keys(TYPE_HUES)) {
      expect(css).toContain(`--color-scope-${type}: var(--c-scope-${type});`);
      const defs = css.match(new RegExp(`--c-scope-${type}: hsl\\(`, "g")) || [];
      expect(defs, type).toHaveLength(3);
    }
  });

  it("falls back to a neutral chip for an unknown scope", () => {
    // A scope row can hold a key this build does not know yet (an older
    // frontend against a newer database); it must still render.
    expect(scopeChip("holodeck")).toBe(scopeChip(undefined));
    expect(scopeChip("holodeck")).not.toContain("scope-");
  });
});

describe("usage chip colours", () => {
  it("covers every usage the usage picker offers", () => {
    expect(Object.keys(USAGE_CHIPS).sort()).toEqual([...USAGES].sort());
  });

  // Usage is a different axis from media type, not a parallel taxonomy - it
  // does not get its own hue family (see the comment in scopeColors.js).
  // watch and origin are distinguished by their label text, not colour, so
  // they intentionally share one ink chip rather than each other's chip.
  it("renders every usage as the same ink chip, distinguished by label not colour", () => {
    for (const usage of USAGES) {
      expect(usageChip(usage)).toBe(usageChip(USAGES[0]));
    }
  });

  it("never collides with a scope chip", () => {
    // This is the exact bug this test guards: an earlier draft gave `watch`
    // the identical class string as SCOPE_CHIPS.anime and `origin` the
    // identical string as SCOPE_CHIPS.manga, so a usage chip and a scope
    // chip rendered pixel-identical side by side in the same table.
    const scopeChipValues = new Set(Object.values(SCOPE_CHIPS));
    for (const chip of Object.values(USAGE_CHIPS)) {
      expect(scopeChipValues.has(chip)).toBe(false);
    }
  });

  it("draws its styling from semantic tokens, never a raw palette colour or scope hue", () => {
    const PALETTE =
      /(?:bg|text|border)-(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+/;
    for (const chip of Object.values(USAGE_CHIPS)) {
      expect(chip).not.toMatch(PALETTE);
      expect(chip).not.toMatch(/#[0-9a-f]{3,8}/i);
      expect(chip).not.toMatch(/scope-/);
    }
  });

  it("falls back to a neutral chip for an unknown usage", () => {
    expect(usageChip("holodeck")).toBe(usageChip(undefined));
    expect(usageChip("holodeck")).not.toContain("scope-");
  });
});
