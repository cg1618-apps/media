import { describe, expect, it } from "vitest";
import {
  displayPersonName,
  displayStudioName,
  getDisplayName,
  getNamingFields,
  getSortName,
} from "./naming";

describe("displayStudioName", () => {
  it("honours the chosen field", () => {
    expect(
      displayStudioName({
        name_en: "Kyoto Animation",
        name_alt: "KyoAni",
        display_name_field: "alt",
      }),
    ).toBe("KyoAni");
  });

  it("falls back when the chosen field is empty", () => {
    expect(
      displayStudioName({ name_en: "Kyoto Animation", display_name_field: "alt" }),
    ).toBe("Kyoto Animation");
  });

  it("falls back en -> cn -> jp -> alt when unchosen", () => {
    expect(displayStudioName({ name_cn: "京都動畫", name_jp: "京アニ" })).toBe("京都動畫");
    expect(displayStudioName({ name_jp: "京アニ" })).toBe("京アニ");
    expect(displayStudioName({ name_alt: "KyoAni" })).toBe("KyoAni");
  });

  it("returns an empty string for a studio with no names", () => {
    expect(displayStudioName({})).toBe("");
    expect(displayStudioName(null)).toBe("");
  });
});

describe("displayPersonName", () => {
  it("honours display_name_field", () => {
    expect(
      displayPersonName({
        name_en: "Ryan Coogler",
        name_cn: "瑞恩·庫格勒",
        display_name_field: "cn",
      }),
    ).toBe("瑞恩·庫格勒");
  });

  it("falls back when the chosen field is empty", () => {
    expect(
      displayPersonName({ name_jp: "諫山創", display_name_field: "cn" }),
    ).toBe("諫山創");
  });

  it("falls back en -> cn -> jp -> alt when unset", () => {
    expect(displayPersonName({ name_cn: "渡部高志", name_jp: "x" })).toBe(
      "渡部高志",
    );
    expect(displayPersonName({ name_alt: "only" })).toBe("only");
  });

  it("returns an empty string for a nameless person", () => {
    expect(displayPersonName({})).toBe("");
    expect(displayPersonName(null)).toBe("");
  });
});

describe("hentai names", () => {
  it("resolves the display name CN -> EN -> Alt -> roman -> JP, as the server does", () => {
    expect(getDisplayName({ hentai_name_cn: "C", hentai_name_en: "E" }, "hentai")).toBe("C");
    expect(getDisplayName({ hentai_name_alt: "A", hentai_name_roman: "R" }, "hentai")).toBe("A");
    expect(getDisplayName({ hentai_name_jp: "J", hentai_name_roman: "R" }, "hentai")).toBe("R");
    expect(getDisplayName({ hentai_name_jp: "J" }, "hentai")).toBe("J");
  });

  it("shows all five names on the naming card", () => {
    expect(getNamingFields({}, "hentai").map((f) => f.label)).toEqual([
      "Chinese",
      "English",
      "Roman",
      "Japanese",
      "Alternative",
    ]);
  });
});

describe("h-comic names", () => {
  it("resolves the display name CN -> EN -> Alt -> JP -> KR, as the server does", () => {
    expect(getDisplayName({ h_comic_name_en: "E", h_comic_name_kr: "K" }, "h-comic")).toBe("E");
    expect(getDisplayName({ h_comic_name_kr: "K" }, "h-comic")).toBe("K");
    expect(getDisplayName({ h_comic_name_cn: "C", h_comic_name_en: "E" }, "h-comic")).toBe("C");
  });

  it("sorts by the English name first", () => {
    expect(getSortName({ h_comic_name_cn: "C", h_comic_name_en: "E" }, "h-comic")).toBe("E");
  });

  it("shows only the region's own name on the naming card", () => {
    const labels = (region) =>
      getNamingFields({ region }, "h-comic").map((f) => f.label);
    expect(labels("JP")).toContain("Japanese");
    expect(labels("JP")).not.toContain("Korean");
    expect(labels("KR")).toContain("Korean");
    expect(labels("KR")).not.toContain("Japanese");
  });
});
