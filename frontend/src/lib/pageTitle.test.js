// Frontend: the tab title a route carries before a page names itself.
import { describe, expect, it } from "vitest";

import { SITE_NAME, routeTitle } from "./pageTitle";

describe("routeTitle", () => {
  it("uses the nav row's label for a page the nav links to", () => {
    expect(routeTitle("/seasonal")).toBe("Seasonal");
    expect(routeTitle("/future-releases")).toBe("Future Releases");
    expect(routeTitle("/users")).toBe("Users");
  });

  it("names a library row as a library", () => {
    expect(routeTitle("/library/anime")).toBe("Anime Library");
    expect(routeTitle("/library/anime-movie")).toBe("Anime Movie Library");
    expect(routeTitle("/library/hentai")).toBe("Hentai Library");
    expect(routeTitle("/library/seiyuu")).toBe("Seiyuu Library");
  });

  it("names the pages that have no nav row", () => {
    expect(routeTitle("/")).toBe("Dashboard");
    expect(routeTitle("/login")).toBe("Log In");
    expect(routeTitle("/settings")).toBe("Settings");
  });

  it("falls back to the row a record page lights up, segment-aware", () => {
    expect(routeTitle("/anime/12/some-slug")).toBe("Anime");
    expect(routeTitle("/anime-movie/3")).toBe("Anime Movie");
    expect(routeTitle("/series/4")).toBe("Franchise");
    expect(routeTitle("/random/anime")).toBe("Random Picker");
  });

  it("ignores a trailing slash", () => {
    expect(routeTitle("/seasonal/")).toBe("Seasonal");
  });

  it("falls back to the site's name for a route nothing names", () => {
    expect(routeTitle("/no-such-page")).toBe(SITE_NAME);
  });
});
