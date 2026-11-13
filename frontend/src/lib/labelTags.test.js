import { describe, expect, it } from "vitest";

import {
  LABEL_FOR_TAG,
  TAG_FOR_LABEL,
  applyLabelEdit,
  applyTagEdit,
  hasLabelField,
  joinTags,
  labelsForTags,
  nsfwTagRefusal,
  splitTags,
  tagsForLabels,
  withNsfw,
} from "./labelTags";

describe("the label-tag pairs", () => {
  it("names the three tagged labels once, both ways", () => {
    expect(TAG_FOR_LABEL).toEqual({
      nsfw: "NSFW",
      ecchi: "輕微色情",
      erotica: "擦邊肉番",
    });
    expect(LABEL_FOR_TAG).toEqual({
      NSFW: "nsfw",
      輕微色情: "ecchi",
      擦邊肉番: "erotica",
    });
  });

  it("has the Label field on the nine ungated types only", () => {
    for (const type of ["anime", "movie", "game", "comic", "tv-show"]) {
      expect(hasLabelField(type)).toBe(true);
    }
    for (const type of ["h-comic", "hentai", "h-game", "collection", "franchise", "series"]) {
      expect(hasLabelField(type)).toBe(false);
    }
  });

  it("splits and joins the comma string MultiSelect holds", () => {
    expect(splitTags(" A, ,B ")).toEqual(["A", "B"]);
    expect(splitTags(undefined)).toEqual([]);
    expect(joinTags(["A", "B"])).toBe("A, B");
  });
});

describe("tagsForLabels", () => {
  it("appends a missing label tag and keeps every other tag in place", () => {
    expect(tagsForLabels(["校園", "戀愛"], ["ecchi", "nsfw"])).toEqual([
      "校園",
      "戀愛",
      "NSFW",
      "輕微色情",
    ]);
  });

  it("drops a label tag whose label is gone, leaving the rest alone", () => {
    expect(tagsForLabels(["NSFW", "校園", "輕微色情"], ["nsfw"])).toEqual([
      "NSFW",
      "校園",
    ]);
  });

  it("ignores a label that has no tag", () => {
    expect(tagsForLabels(["校園"], ["hentai"])).toEqual(["校園"]);
  });
});

describe("labelsForTags", () => {
  it("ticks the labels of the tags held and unticks the rest", () => {
    expect(labelsForTags(["erotica", "nsfw"], ["NSFW", "輕微色情"])).toEqual([
      "ecchi",
      "nsfw",
    ]);
  });

  it("leaves a label with no tag as it is", () => {
    expect(labelsForTags(["hentai"], [])).toEqual(["hentai"]);
  });
});

describe("applyLabelEdit", () => {
  it("brings nsfw and its tag with any other label", () => {
    expect(applyLabelEdit(["校園"], ["erotica"])).toEqual({
      labels: ["erotica", "nsfw"],
      tags: ["校園", "NSFW", "擦邊肉番"],
    });
  });

  it("removes the tag of an unticked label", () => {
    expect(applyLabelEdit(["NSFW", "校園", "擦邊肉番"], ["nsfw"])).toEqual({
      labels: ["nsfw"],
      tags: ["NSFW", "校園"],
    });
  });
});

describe("applyTagEdit", () => {
  it("adding 輕微色情 ticks ecchi, and nsfw with its NSFW tag", () => {
    expect(applyTagEdit([], ["校園"], ["校園", "輕微色情"])).toEqual({
      labels: ["ecchi", "nsfw"],
      tags: ["校園", "輕微色情", "NSFW"],
      refused: false,
    });
  });

  it("removing a label tag unticks its label, keeping nsfw", () => {
    expect(
      applyTagEdit(["ecchi", "nsfw"], ["NSFW", "輕微色情"], ["NSFW"]),
    ).toEqual({ labels: ["nsfw"], tags: ["NSFW"], refused: false });
  });

  it("removing NSFW alone unticks nsfw", () => {
    expect(applyTagEdit(["nsfw"], ["NSFW", "校園"], ["校園"])).toEqual({
      labels: [],
      tags: ["校園"],
      refused: false,
    });
  });

  it("refuses to drop NSFW while 輕微色情 stays - the locked case", () => {
    // The set is non-empty on purpose: with no other label held there is
    // nothing to lock NSFW, and the refusal would pass vacuously.
    const prev = ["NSFW", "校園", "輕微色情"];
    expect(applyTagEdit(["ecchi", "nsfw"], prev, ["校園", "輕微色情"])).toEqual({
      labels: ["ecchi", "nsfw"],
      tags: prev,
      refused: true,
    });
  });

  it("does not touch a tag that is not a label tag", () => {
    expect(applyTagEdit([], [], ["校園", "戀愛"])).toEqual({
      labels: [],
      tags: ["校園", "戀愛"],
      refused: false,
    });
  });

  it("says which tags hold NSFW", () => {
    expect(nsfwTagRefusal(["ecchi", "nsfw"])).toBe(
      '"NSFW" is carried with 輕微色情 - remove that first.',
    );
  });
});

describe("withNsfw", () => {
  it("adds nsfw to any other label and sorts", () => {
    expect(withNsfw(["erotica"])).toEqual(["erotica", "nsfw"]);
    expect(withNsfw([])).toEqual([]);
  });
});
