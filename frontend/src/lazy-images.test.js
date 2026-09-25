// Guard: every <img> lazy-loads. Covers are served from the box's upload, and
// an eager image on a list of hundreds of entries downloads every cover on the
// page at once, which is what starves every other request through the tunnel.
// See docs/frontend/design-system.md, rule 8.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// vitest runs from frontend/; import.meta.url is not a file: URL under jsdom.
const SRC = join(process.cwd(), "src");
// An <img ...> or <img ... /> tag, across lines, up to its closing bracket.
const IMG_TAG = /<img\b[^>]*?\/?>/gs;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.jsx?$/.test(name) && !/\.test\.jsx?$/.test(name)) yield p;
  }
}

it("lazy-loads every image", () => {
  const offenders = [];
  for (const file of walk(SRC)) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(IMG_TAG)) {
      if (!/\bloading="lazy"/.test(match[0])) {
        const line = text.slice(0, match.index).split("\n").length;
        offenders.push(`${relative(SRC, file)}:${line}`);
      }
    }
  }
  expect(offenders).toEqual([]);
});
