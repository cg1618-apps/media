// Frontend: a way into each library, for a viewer with no tracker of its own
// (a guest, a shared account).
//
// The links are the nav's own Library and Restricted rows, taken from
// visibleSections with the same arguments Nav.jsx passes, so the dashboard
// and the header never disagree about which libraries this viewer may open.
// They are drawn in rows of their own, not the nav's columns: the group and
// entity libraries first, a rule, then the media tier by what the viewer does
// with it - Watch, Read, Play. A gated type sits in its counterpart's row,
// after the ordinary types, as the Restricted tab follows the Library tab.
import { Link } from "react-router-dom";

import {
  NAV_SECTIONS,
  sectionItems,
  visibleSections,
} from "../../config/navigation";
import { useAuth } from "../../contexts/AuthContext";
import { canSeeGatedType } from "../../lib/gatedTypes";
import { Eyebrow, Slip } from "../ui/primitives";

/** The nav sections whose rows are libraries. */
export const LIBRARY_SECTION_KEYS = ["library", "restricted"];

/**
 * The library rows of `sections` (already trimmed by visibleSections), one
 * group per nav section, dividers dropped.
 */
export function libraryLinkGroups(sections) {
  return sections
    .filter((s) => LIBRARY_SECTION_KEYS.includes(s.key))
    .map((s) => ({
      key: s.key,
      label: s.label,
      items: sectionItems(s).filter((item) => !item.divider),
    }))
    .filter((g) => g.items.length > 0);
}

/**
 * The dashboard's library rows, each a list of library paths in display
 * order. `media` marks the media-tier rows, which sit below the rule.
 */
export const LIBRARY_ROWS = [
  {
    key: "groups",
    label: "Groups",
    media: false,
    paths: [
      "/library/collection",
      "/library/franchise",
      "/library/series",
      "/library/studio",
      "/library/publisher",
      "/library/person",
      "/library/character",
    ],
  },
  {
    key: "watch",
    label: "Watch",
    media: true,
    paths: [
      "/library/anime",
      "/library/anime-movie",
      "/library/movie",
      "/library/tv-show",
      "/library/cartoon",
      "/library/hentai",
    ],
  },
  {
    key: "read",
    label: "Read",
    media: true,
    paths: ["/library/manga", "/library/book", "/library/comic", "/library/h-comic"],
  },
  {
    key: "play",
    label: "Play",
    media: true,
    paths: ["/library/game", "/library/h-game"],
  },
];

/**
 * `groups` (from libraryLinkGroups) laid out as LIBRARY_ROWS: each row holds
 * the viewer's links among its paths, in the row's order. A row with none is
 * dropped.
 */
export function libraryLinkRows(groups) {
  const byPath = new Map(
    groups.flatMap((g) => g.items).map((item) => [item.to, item]),
  );
  return LIBRARY_ROWS.map(({ paths, ...row }) => ({
    ...row,
    items: paths.filter((p) => byPath.has(p)).map((p) => byPath.get(p)),
  })).filter((row) => row.items.length > 0);
}

/** This viewer's library link groups, computed the way Nav.jsx computes its tabs. */
export function useLibraryLinks() {
  const auth = useAuth();
  const sections = visibleSections(
    NAV_SECTIONS,
    auth.has,
    (type) => canSeeGatedType(auth, type),
    auth.hasFeature,
  );
  return libraryLinkGroups(sections);
}

// Placeholder rows route to the holding page, as in the nav.
function itemHref(item) {
  return item.dev ? "/under-development" : item.to;
}

export default function LibraryLinks({ groups }) {
  const rows = libraryLinkRows(groups);
  const firstMedia = rows.findIndex((row) => row.media);
  return (
    <div className="pt-6" data-testid="library-links">
      <Slip bodyClassName="space-y-4">
        {rows.map((row, i) => (
          <div key={row.key} className="space-y-4">
            {i > 0 && i === firstMedia && (
              <hr className="border-t border-border" data-testid="library-tier-rule" />
            )}
            <div
              data-testid={`library-row-${row.key}`}
              className="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-4"
            >
              <Eyebrow as="h3" className="sm:w-14 shrink-0">
                {row.label}
              </Eyebrow>
              <ul className="flex flex-wrap gap-2">
                {row.items.map((item) => (
                  <li key={item.to}>
                    <Link
                      to={itemHref(item)}
                      className="inline-block border border-border px-3 py-1.5 text-sm text-text hover:border-border-strong hover:text-brand transition-colors"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </Slip>
    </div>
  );
}
