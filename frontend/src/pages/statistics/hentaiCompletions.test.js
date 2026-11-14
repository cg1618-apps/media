import { describe, it, expect } from "vitest";
import hentaiCompletionGroups, { UNRECORDED } from "./hentaiCompletions";
import { COMPLETED_STATUSES } from "../../utils/media";

const done = (system_id, source_material, completed_at = "2026-01-01") => ({
  system_id,
  source_material,
  watching_status: COMPLETED_STATUSES[0],
  completed_at,
});

describe("hentaiCompletionGroups", () => {
  it("groups a game adaptation under Game, not under Unrecorded", () => {
    const groups = hentaiCompletionGroups([done("a", "Game"), done("b", null)]);
    expect(groups.map((g) => g.key)).toEqual(["Game", UNRECORDED]);
    expect(groups[0].items.map((h) => h.system_id)).toEqual(["a"]);
  });

  it("orders the groups as the vocabulary does, unrecorded last", () => {
    const groups = hentaiCompletionGroups([
      done("g", "Game"),
      done("u", "Something Else"),
      done("m", "Manga"),
      done("o", "Original"),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["Original", "Manga", "Game", UNRECORDED]);
  });

  it("leaves out an entry that is not completed", () => {
    const watching = { ...done("w", "Manga"), watching_status: "Watching" };
    expect(hentaiCompletionGroups([watching])).toEqual([]);
  });
});
