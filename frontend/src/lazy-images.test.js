// Guard: every image is drawn by components/ui/LazyImage.jsx. Native
// loading="lazy" starts an image once it comes near the screen and never
// cancels it, so a fast scroll through a library fires every cover it passes,
// and each cover is a gated request that holds a server worker and a database
// connection. LazyImage waits until the image has stayed near the screen and
// drops a load the scroll has already left behind; a raw <img> anywhere else
// skips both. See docs/frontend/design-system.md, rule 8.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// vitest runs from frontend/; import.meta.url is not a file: URL under jsdom.
const SRC = join(process.cwd(), "src");
// The one file allowed to draw a raw <img>.
const LAZY_IMAGE = join(SRC, "components", "ui", "LazyImage.jsx");
// A JSX <img opener; "<img>" in a comment is prose, not a tag.
const IMG_OPENER = /<img\b/g;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.jsx?$/.test(name) && !/\.test\.jsx?$/.test(name)) yield p;
  }
}

it("draws every image through LazyImage", () => {
  const offenders = [];
  for (const file of walk(SRC)) {
    if (file === LAZY_IMAGE) continue;
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(IMG_OPENER)) {
      const lineStart = text.lastIndexOf("\n", match.index) + 1;
      if (/^\s*(\/\/|\*|\/\*)/.test(text.slice(lineStart, match.index))) continue;
      const line = text.slice(0, match.index).split("\n").length;
      offenders.push(`${relative(SRC, file)}:${line}`);
    }
  }
  expect(offenders).toEqual([]);
});
