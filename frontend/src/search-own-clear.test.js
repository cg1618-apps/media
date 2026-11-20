// Guard: a search field that draws its own clear button hides the browser's.
// Chrome and Safari add a native cross to every <input type="search">, so a
// field with our "Clear search" button beside it would show two crosses doing
// the same thing. The `search-own-clear` utility in index.css hides the
// native one; a search field without a clear button of its own keeps it.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, it } from "vitest";

// vitest runs from frontend/; import.meta.url is not a file: URL under jsdom.
const SRC = join(process.cwd(), "src");

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.jsx?$/.test(name) && !/\.test\.jsx?$/.test(name)) yield p;
  }
}

it("hides the native clear wherever a search field draws its own", () => {
  const checked = [];
  const offenders = [];
  for (const file of walk(SRC)) {
    const text = readFileSync(file, "utf8");
    if (!text.includes('type="search"') || !text.includes('aria-label="Clear search"')) {
      continue;
    }
    checked.push(relative(SRC, file));
    if (!text.includes("search-own-clear")) offenders.push(relative(SRC, file));
  }
  // The four entity libraries draw their own cross; an empty list would mean
  // the scan matched nothing and proved nothing.
  expect(checked.length).toBeGreaterThanOrEqual(4);
  expect(offenders).toEqual([]);
});
