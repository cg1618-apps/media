// The entity pages' left-column links card: built like SourcesCard's rows,
// in the order its `links` list gives, and left out when nothing is linked.
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import EntityLinksCard, { ENTITY_LINKS } from "./EntityLinksCard";

const PERSON = {
  imdb_link: "https://www.imdb.com/name/nm1/",
  mal_link: "https://myanimelist.net/people/1",
  anilist_link: "https://anilist.co/staff/1",
  twitter_link: "https://x.com/someone",
  ig_link: null,
  pixiv_link: "https://www.pixiv.net/users/1",
};

describe("EntityLinksCard", () => {
  it("draws one external link per set field, in the list's order", () => {
    render(<EntityLinksCard item={PERSON} links={ENTITY_LINKS.person} />);
    const card = screen.getByRole("region", { name: "Links" });
    const links = within(card).getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual([
      "IMDb",
      "MyAnimeList",
      "AniList",
      "Twitter",
      "pixiv",
    ]);
    expect(links[0]).toHaveAttribute("href", PERSON.imdb_link);
    expect(links[0]).toHaveAttribute("target", "_blank");
    expect(links[0]).toHaveAttribute("rel", "noreferrer");
  });

  it("puts IMDb above MyAnimeList", () => {
    const order = ENTITY_LINKS.person.map((l) => l.site);
    expect(order.indexOf("IMDb")).toBeLessThan(order.indexOf("MyAnimeList"));
  });

  it("wears the site's own icon where one is bundled, and an empty slot where not", () => {
    render(<EntityLinksCard item={PERSON} links={ENTITY_LINKS.person} />);
    const imdb = screen.getByRole("link", { name: "IMDb" });
    expect(within(imdb).getByTestId("source-icon")).toBeInTheDocument();
    const pixiv = screen.getByRole("link", { name: "pixiv" });
    expect(within(pixiv).queryByTestId("source-icon")).toBeNull();
  });

  it("is left out when the entity links nowhere", () => {
    const { container } = render(
      <EntityLinksCard item={{ mal_link: null, anilist_link: "" }} links={ENTITY_LINKS.character} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("lists a studio's website with its MAL and AniList pages", () => {
    render(
      <EntityLinksCard
        item={{
          website_url: "https://studio.test/",
          mal_link: "https://myanimelist.net/anime/producer/2",
          anilist_link: "https://anilist.co/studio/2",
        }}
        links={ENTITY_LINKS.studio}
      />,
    );
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual([
      "MyAnimeList",
      "AniList",
      "Website",
    ]);
  });
});
