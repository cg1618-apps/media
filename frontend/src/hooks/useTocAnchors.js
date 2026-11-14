// Frontend: the table of contents a page has actually rendered.
//
// A detail page's sections come and go with the viewer and the data - a cast
// list with nobody in it renders nothing, the notes registry arrives after the
// entry, a guest is shown fewer note cards than a member. Writing those
// conditions a second time as a list would let the list and the page disagree,
// so the contents are read from the page instead: every element carrying
// `data-toc` (TocSection, and the note cards) is a row, labelled by that
// attribute, in document order. One that rendered nothing inside is skipped.
// A MutationObserver re-reads the container whenever its tree changes, which
// is how the note cards join once their fetch resolves.
import { useEffect, useState } from "react";

function readAnchors(root) {
  return Array.from(root.querySelectorAll("[data-toc]"))
    .filter((el) => el.id && el.childElementCount > 0)
    .map((el) => ({ id: el.id, label: el.dataset.toc, level: 1 }));
}

function sameAnchors(a, b) {
  return a.length === b.length && a.every((x, i) => x.id === b[i].id && x.label === b[i].label);
}

/** The `{ id, label, level }` rows under `ref`'s element, kept current. */
export function useTocAnchors(ref) {
  const [anchors, setAnchors] = useState([]);

  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const update = () =>
      setAnchors((prev) => {
        const next = readAnchors(root);
        return sameAnchors(prev, next) ? prev : next;
      });
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-toc", "id"],
    });
    return () => observer.disconnect();
  }, [ref]);

  return anchors;
}
