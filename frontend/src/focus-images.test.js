// Guard: every cropped image honours its focal point. An <img> drawn with
// object-cover shows only part of the picture, and without an
// object-position that part is the centre - a portrait cover cropped to a
// square loses the face at the top. So a cropped <img> either sets a style=
// (which carries focusStyle(...) from lib/covers.js) or says, with
// data-focus="none", that it is not an owner's image and has no focus to
// apply. See docs/frontend/design-system.md, rule 9.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// vitest runs from frontend/; import.meta.url is not a file: URL under jsdom.
const SRC = join(process.cwd(), "src");

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.jsx?$/.test(name) && !/\.test\.jsx?$/.test(name)) yield p;
  }
}

// Every <img ...> tag, up to the ">" that closes it. A regex cannot do this:
// an attribute like onError={(e) => ...} holds a ">" of its own, so the scan
// skips over {...} expressions, quoted strings and comments while looking for
// the end.
function* imgTags(text) {
  const opener = /<img\b/g;
  let m;
  while ((m = opener.exec(text))) {
    let depth = 0;
    let quote = null;
    let i = m.index + 4;
    for (; i < text.length; i++) {
      const c = text[i];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === "/" && text[i + 1] === "/") {
        // A comment between attributes may hold an apostrophe or a ">".
        i = text.indexOf("\n", i);
        if (i === -1) break;
      } else if (c === "/" && text[i + 1] === "*") {
        i = text.indexOf("*/", i) + 1;
        if (i === 0) break;
      } else if (c === '"' || c === "'" || c === "`") {
        quote = c;
      } else if (c === "{") {
        depth++;
      } else if (c === "}") {
        depth--;
      } else if (c === ">" && depth === 0) {
        break;
      }
    }
    yield { index: m.index, tag: text.slice(m.index, i + 1) };
  }
}

it("positions every cropped image by its focus, or opts out explicitly", () => {
  const offenders = [];
  for (const file of walk(SRC)) {
    const text = readFileSync(file, "utf8");
    for (const { index, tag } of imgTags(text)) {
      if (!/object-cover/.test(tag)) continue;
      if (/\bstyle=\{/.test(tag) || /\bdata-focus="none"/.test(tag)) continue;
      const line = text.slice(0, index).split("\n").length;
      offenders.push(`${relative(SRC, file)}:${line}`);
    }
  }
  expect(offenders).toEqual([]);
});
