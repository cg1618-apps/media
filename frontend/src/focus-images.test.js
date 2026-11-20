// Guard: every cropped image honours its focal point. An image drawn with
// object-cover shows only part of the picture, and without an
// object-position that part is the centre - a portrait cover cropped to a
// square loses the face at the top. So a cropped <LazyImage> either sets a style=
// (which carries focusStyle(...) from lib/covers.js) or says, with
// data-focus="none", that it is not an owner's image and has no focus to
// apply. And because a zoomed focus scales the image, each one sits in a frame
// that clips it. See docs/frontend/design-system.md, rule 9.
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

// The index of the ">" that closes the tag whose name ends at `i`. A regex
// cannot find it: an attribute like onError={(e) => ...} holds a ">" of its
// own, so the scan skips over {...} expressions, quoted strings and comments.
function tagEnd(text, i) {
  let depth = 0;
  let quote = null;
  for (; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === "/" && text[i + 1] === "/") {
      // A comment between attributes may hold an apostrophe or a ">".
      i = text.indexOf("\n", i);
      if (i === -1) return text.length;
    } else if (c === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i) + 1;
      if (i === 0) return text.length;
    } else if (c === '"' || c === "'" || c === "`") {
      quote = c;
    } else if (c === "{") {
      depth++;
    } else if (c === "}") {
      depth--;
    } else if (c === ">" && depth === 0) {
      return i;
    }
  }
  return i;
}

// Every cropped owner image: a <LazyImage ...> - or a raw <img ...>, which
// lazy-images.test.js refuses anyway - drawn with object-cover and not opted
// out with data-focus="none". Each comes with the opening tag of the element
// directly around it: JSX tags are walked in order with a stack of the open
// ones, and a fragment counts as an element with no class, so an image whose
// only parent is <>...</> has no frame.
function* croppedImages(text) {
  const opener = /<(\/?)([A-Za-z][\w.]*)?/g;
  const open = [];
  let m;
  while ((m = opener.exec(text))) {
    const [, closing, name = ""] = m;
    if (!name && text[opener.lastIndex] !== ">") continue; // a "<" comparison
    const end = tagEnd(text, opener.lastIndex);
    const tag = text.slice(m.index, end + 1);
    opener.lastIndex = end + 1;
    if (closing) {
      const at = open.map((o) => o.name).lastIndexOf(name);
      if (at >= 0) open.length = at;
      continue;
    }
    if (
      (name === "LazyImage" || name === "img") &&
      /object-cover/.test(tag) &&
      !/\bdata-focus="none"/.test(tag)
    ) {
      yield { index: m.index, tag, parent: open.at(-1)?.tag ?? "" };
    }
    if (text[end - 1] !== "/") open.push({ name, tag });
  }
}

function where(file, text, index) {
  return `${relative(SRC, file)}:${text.slice(0, index).split("\n").length}`;
}

it("positions every cropped image by its focus, or opts out explicitly", () => {
  const offenders = [];
  for (const file of walk(SRC)) {
    const text = readFileSync(file, "utf8");
    for (const { index, tag } of croppedImages(text)) {
      if (/\bstyle=\{/.test(tag)) continue;
      offenders.push(where(file, text, index));
    }
  }
  expect(offenders).toEqual([]);
});

// A zoomed focus scales the image (focusStyle in lib/covers.js), and a scaled
// image spills over whatever is beside it unless its frame clips. So every
// focused image fills a frame of its own - w-full h-full inside the element
// directly around it - and that frame is overflow-hidden. An image that is its
// own frame (w-9 h-12 object-cover) is wrapped in one instead.
it("draws every focused image inside a frame that clips it", () => {
  const offenders = [];
  for (const file of walk(SRC)) {
    const text = readFileSync(file, "utf8");
    for (const { index, tag, parent } of croppedImages(text)) {
      const fills = /\bw-full\b/.test(tag) && /\bh-full\b/.test(tag);
      if (fills && /\boverflow-hidden\b/.test(parent)) continue;
      offenders.push(where(file, text, index));
    }
  }
  expect(offenders).toEqual([]);
});
