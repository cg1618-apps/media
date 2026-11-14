// Frontend: the browser tab's title, held in one place.
//
// PageTitleProvider is the only code that writes document.title. It takes the
// route's own title (lib/pageTitle.js) and lets the page on screen replace it
// with usePageTitle - a detail page naming the record it shows. When that
// page unmounts, its name goes with it and the route's title returns.
import { createContext, useContext, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { routeTitle } from "../lib/pageTitle";

const PageTitleContext = createContext(null);

export function PageTitleProvider({ children }) {
  const { pathname } = useLocation();
  const [pageTitle, setPageTitle] = useState(null);
  const title = pageTitle || routeTitle(pathname);

  useEffect(() => {
    document.title = title;
  }, [title]);

  return <PageTitleContext.Provider value={setPageTitle}>{children}</PageTitleContext.Provider>;
}

/**
 * Names the current page in the browser tab.
 *
 * Pass the name the page's heading shows, or null while there is none yet
 * (loading, not found): the route's own title stands in until then. Outside a
 * PageTitleProvider this does nothing, so a page rendered alone in a test
 * needs no wrapper.
 */
export function usePageTitle(title) {
  const setPageTitle = useContext(PageTitleContext);
  useEffect(() => {
    if (!setPageTitle) return undefined;
    setPageTitle(title || null);
    return () => setPageTitle(null);
  }, [setPageTitle, title]);
}
