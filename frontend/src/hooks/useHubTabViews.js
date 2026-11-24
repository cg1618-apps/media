// The sort, filters and grouping of every media tab on one hub page, held at
// the page so a tab keeps its view while another tab is open. A tab nobody
// has touched reads its defaults (lib/hubTabs.js).
import { useCallback, useState } from "react";
import { defaultView } from "../lib/hubTabs";

export function useHubTabViews(scope) {
  const [views, setViews] = useState({});

  const viewOf = useCallback(
    (type) => views[type] ?? defaultView(type, scope),
    [views, scope],
  );

  // `update` maps the tab's current view to its next one.
  const updateView = useCallback(
    (type, update) =>
      setViews((prev) => ({
        ...prev,
        [type]: update(prev[type] ?? defaultView(type, scope)),
      })),
    [scope],
  );

  return { viewOf, updateView };
}
