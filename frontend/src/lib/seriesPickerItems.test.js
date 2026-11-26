import { describe, expect, it } from "vitest";

import { seriesPickerItems } from "./seriesPickerItems";

describe("seriesPickerItems", () => {
  it("carries each series' parent franchise, its label and its searchable names", () => {
    const [item] = seriesPickerItems([
      {
        system_id: "s1",
        franchise_id: "f1",
        series_name_en: "Arc",
        series_name_cn: "篇",
        series_name_alt: null,
      },
    ]);
    expect(item).toMatchObject({ id: "s1", franchiseId: "f1", searchText: "篇 Arc" });
    expect(item.label).toBeTruthy();
  });
});
