// Frontend: keeps the address bar showing the canonical /type/id/slug path.
//
// The slug is decorative and never read, so a stale one after a rename is
// harmless - but it should not stay in the bar. replaceState rather than
// navigate: this is a cosmetic correction, not a navigation, and it must not
// add a history entry the back button has to walk through.
//
// It corrects the slug only, never the record. A link from one record to
// another of the same type (a related franchise, a related studio) reuses the
// page, so for a moment the URL names the new record while `entity` is still
// the old one. Rewriting the address then would send the reader back to the
// record they just left, so a path naming a different record is left alone
// until the new one has loaded.
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { entityPath } from "../lib/entityPath";

// "/type/id" out of "/type/id/slug".
const recordOf = (path) => path.split("/").slice(0, 3).join("/");

export function useCanonicalPath(type, entity) {
  const location = useLocation();
  const navigate = useNavigate();
  const canonical = entityPath(type, entity);

  useEffect(() => {
    if (!canonical) return;
    if (location.pathname === canonical) return;
    if (recordOf(location.pathname) !== recordOf(canonical)) return;
    navigate(canonical + location.search + location.hash, { replace: true });
  }, [canonical, location.pathname, location.search, location.hash, navigate]);
}
