// Guard: nothing is set in capitals for style. Labels, chips, table headers
// and section titles read in the casing their text is written in, at the
// face's own letter-spacing (docs/frontend/design-system.md, rule 2). Real
// acronyms (TV, OP, MAL, ...) are capitals in the text itself, not a
// transform, so they need no exception here.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// vitest runs from frontend/; import.meta.url is not a file: URL under jsdom.
const SRC = join(process.cwd(), "src");
const UPPERCASE = /(?<![\w-])(?:[\w-]+:)*uppercase(?![\w-])|text-transform\s*:\s*uppercase/g;
// Wide letter-spacing exists for capitals, so it goes where they go.
const WIDE_TRACKING = /(?<![\w-])(?:[\w-]+:)*tracking-(?:\[0?\.\d+em\]|wide|wider|widest)(?![\w-])/g;

// The only sanctioned capitals. The account's role chip, on the nav strip and
// again in the mobile drawer, keeps its uppercase and tracking; the CG1618
// brand mark is capitals as written and keeps its tracking.
const ALLOWED = {
  "components/layout/Nav.jsx": { uppercase: 2, tracking: 3 },
};

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(jsx?|css)$/.test(name) && !/\.test\.jsx?$/.test(name)) yield p;
  }
}

it("sets no text in capitals for style outside the sanctioned sites", () => {
  const offenders = [];
  for (const file of walk(SRC)) {
    const rel = relative(SRC, file).replaceAll("\\", "/");
    const text = readFileSync(file, "utf8");
    const caps = [...text.matchAll(UPPERCASE)].length;
    const wide = [...text.matchAll(WIDE_TRACKING)].length;
    const allowed = ALLOWED[rel] ?? { uppercase: 0, tracking: 0 };
    if (caps !== allowed.uppercase) offenders.push(`${rel}: ${caps} uppercase`);
    if (wide !== allowed.tracking) offenders.push(`${rel}: ${wide} wide tracking`);
  }
  expect(offenders).toEqual([]);
});
