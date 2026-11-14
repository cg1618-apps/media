// Frontend: the browser tab's title for a route, before a page names itself.
//
// The tab shows the page's name and nothing else - no site suffix. Pages with
// a nav row take that row's label, so the tab and the menu never disagree; a
// library row reads "<label> Library", because the nav prints those rows
// under the Library tab and "Anime" alone would read as an entry page. A page
// that shows one record (an entry, a group, a person) names itself with
// usePageTitle; until it does - loading, or a record that failed to load - the
// route falls back to the nav row it lights up, so /anime/<id> reads "Anime".
import { NAV_SECTIONS, activeItem, sectionItems } from "../config/navigation";

// The title of a route nothing else names: index.html's own <title>, so the
// tab reads the same before and after the bundle runs.
export const SITE_NAME = "CG1618 Tracker";

// Pages with no nav row of their own. Each is the name the page goes by where
// it is linked (the account strip's "Requests", "Settings" and "Log in").
const OFF_NAV_TITLES = {
  "/": "Dashboard",
  "/login": "Log In",
  "/register": "Register",
  "/reset": "Reset Password",
  "/search": "Search",
  "/settings": "Settings",
  "/requests": "Requests",
  "/under-development": "Under Development",
};

function navRowTitle(item) {
  return item.to.startsWith("/library/") ? `${item.label} Library` : item.label;
}

// The title a route carries on its own. `sections` is for tests.
export function routeTitle(pathname, sections = NAV_SECTIONS) {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  for (const section of sections) {
    for (const item of sectionItems(section)) {
      if (item.to === path) return navRowTitle(item);
    }
  }
  if (OFF_NAV_TITLES[path]) return OFF_NAV_TITLES[path];
  // A record page, or a sub-route such as /random/anime: the row it lights up.
  const owner = activeItem(path, sections);
  if (owner) return owner.item.label;
  return SITE_NAME;
}
