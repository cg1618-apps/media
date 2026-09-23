import { describe, expect, it } from "vitest";

import { ownerMatches } from "./NotesContext";

// 亮點 Highlights is KR h-comics only (owner_where); the server refuses a note
// on a JP one, so a JP detail page must not draw the card at all.
const HIGHLIGHTS = { key: "h_comic_highlights", owner_where: { region: ["KR"] } };
const REMARK = { key: "remark", owner_where: {} };

describe("ownerMatches", () => {
  it("keeps a narrowed section on a matching row and drops it elsewhere", () => {
    expect(ownerMatches(HIGHLIGHTS, { region: "KR" })).toBe(true);
    expect(ownerMatches(HIGHLIGHTS, { region: "JP" })).toBe(false);
  });

  it("keeps a section with no owner_where on every row", () => {
    expect(ownerMatches(REMARK, { region: "JP" })).toBe(true);
    expect(ownerMatches({ key: "legacy" }, { region: "JP" })).toBe(true);
  });

  it("keeps everything when the page passes no row", () => {
    expect(ownerMatches(HIGHLIGHTS, undefined)).toBe(true);
  });
});
