// Frontend: a way into each library, for a viewer with no tracker of its own
// (a guest, a shared account).
//
// The links are the nav's own Library and Restricted rows, taken from
// visibleSections with the same arguments Nav.jsx passes, so the dashboard
// and the header never disagree about which libraries this viewer may open.
import { Link } from "react-router-dom";

import {
  NAV_SECTIONS,
  sectionItems,
  visibleSections,
} from "../../config/navigation";
import { useAuth } from "../../contexts/AuthContext";
import { canSeeGatedType } from "../../lib/gatedTypes";
import { Slip } from "../ui/primitives";

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
  return (
    <div className="pt-6 space-y-6" data-testid="library-links">
      {groups.map((group) => (
        <Slip key={group.key} title={group.label}>
          <ul className="flex flex-wrap gap-2">
            {group.items.map((item) => (
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
        </Slip>
      ))}
    </div>
  );
}
