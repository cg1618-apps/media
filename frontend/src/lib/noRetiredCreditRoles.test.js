// A tripwire, like noLegacySourceFields.test.js: the person credits of manga,
// novel and comic are `author` and `illustrator`, scoped by media type
// (CREDIT_ROLES in app/utils/credit_roles.py). A retired key sent to PUT
// /api/credits fails the whole body with a 400; one used as a dropdown source
// finds no people; one used to auto-create a person is refused with a 422.
// fieldOptions.test.js pins fieldMeta alone, which is how the per-type tabs
// and payloads.js kept these keys long after fieldMeta dropped them.
//
// Only the QUOTED key is matched, so prose explaining the collapse may still
// name the old keys. fieldOptions.test.js lists them on purpose.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RETIRED = [
  "manga_author",
  "manga_author_plot",
  "manga_author_draw",
  "novel_author",
  "novel_illustrator",
  "comic_writer",
  "comic_artist",
];

const SKIP = ["noRetiredCreditRoles.test.js", "fieldOptions.test.js"];

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walk(join(dir, e.name))
      : e.name.endsWith(".jsx") || e.name.endsWith(".js")
        ? [join(dir, e.name)]
        : [],
  );
}

describe("retired credit role keys", () => {
  it("appear nowhere in the frontend as a value", () => {
    const offenders = [];
    for (const file of walk("src")) {
      if (SKIP.some((s) => file.endsWith(s))) continue;
      const text = readFileSync(file, "utf8");
      for (const key of RETIRED) {
        if (text.includes(`"${key}"`)) offenders.push(`${file}: ${key}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
