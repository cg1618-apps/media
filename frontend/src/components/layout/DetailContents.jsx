// Frontend: a media-type detail page's frame, with its table of contents.
//
// The detail page's left column already holds the cover, the sources and the
// relations, so the contents do not go there: they sit in a column of their
// own on the RIGHT, sticky under the nav, and only on xl+ screens. Below xl the
// page is the same two-column (or one-column) page it was.
//
// Making room: on xl+ the frame is widened by about the contents column
// (max-w-7xl -> 88rem), so the cover column keeps close to its usual width
// instead of losing the contents' 12rem to it.
//
// The rows are the page's TocSections - and the note cards, which wear the
// same attribute - read from what actually rendered (useTocAnchors), so a
// section this viewer is not shown is not listed either.
import { useRef } from "react";

import TableOfContents from "./TableOfContents";
import { useScrollSpy } from "../../hooks/useScrollSpy";
import { useTocAnchors } from "../../hooks/useTocAnchors";

export default function DetailContents({ children }) {
  const bodyRef = useRef(null);
  const items = useTocAnchors(bodyRef);
  const activeId = useScrollSpy(
    items.map(({ id }) => id),
    { enabled: items.length > 0 }
  );

  return (
    <div className="max-w-7xl xl:max-w-[88rem] mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full xl:flex xl:gap-8">
      <div ref={bodyRef} className="min-w-0 xl:flex-1">
        {children}
      </div>
      <aside className="hidden xl:block w-40 shrink-0">
        <TableOfContents items={items} activeId={activeId} />
      </aside>
    </div>
  );
}

/**
 * One main section of a page, as its table of contents lists it.
 *
 * `id` is the anchor and `label` the row's text. A section whose content
 * renders nothing (a component returning null) leaves this element empty: it
 * collapses (`empty:hidden`) and the contents skip it.
 */
export function TocSection({ id, label, className = "", children }) {
  return (
    <section id={id} data-toc={label} className={`empty:hidden ${className}`.trim()}>
      {children}
    </section>
  );
}
