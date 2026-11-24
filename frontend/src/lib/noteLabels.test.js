import { describe, expect, it } from "vitest";

import { chineseLabel } from "./noteLabels";

describe("chineseLabel", () => {
  it.each([
    ["資源&工具 Resources & Tools", "資源&工具"],
    ["資源 Resources", "資源"],
    ["問題 Questions", "問題"],
    ["解析/解惑/討論 Analysis/Discussion", "解析/解惑/討論"],
    ["名言&梗 Quotes and Memes", "名言&梗"],
  ])("keeps only the Chinese of %s", (label, expected) => {
    expect(chineseLabel(label)).toBe(expected);
  });

  it.each(["Notes", "優缺點", "NG 多周目", "神回/神片段", "", undefined])(
    "leaves %s as it is",
    (label) => {
      expect(chineseLabel(label)).toBe(label);
    },
  );
});
