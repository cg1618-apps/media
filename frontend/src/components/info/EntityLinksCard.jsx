// Frontend: info component file for EntityLinksCard.
//
// Where an entity - a person, studio, publisher or character - is looked up
// and where it publishes itself, as a slip in the left column under My
// rating. Each row is SourcesCard's link row: the site's icon
// (lib/sourceIcons.js) and name, an external-link mark at the right. A site
// with no bundled icon (Instagram, pixiv, a website) keeps the empty slot so
// the names line up.
//
// `links` is the list of { field, site } the entity carries, in the order
// they are drawn: the reference databases first - IMDb above MyAnimeList,
// then AniList - and the entity's own pages after. ENTITY_LINKS holds each
// entity type's list. A field left blank gets no row, and with none set the
// card is left out.
import { Slip } from "../ui/primitives";
import { sourceIconUrl } from "../../lib/sourceIcons";
import { SourceLink } from "./SourcesCard";

export const ENTITY_LINKS = {
  person: [
    { field: "imdb_link", site: "IMDb" },
    { field: "mal_link", site: "MyAnimeList" },
    { field: "anilist_link", site: "AniList" },
    { field: "twitter_link", site: "Twitter" },
    { field: "ig_link", site: "Instagram" },
    { field: "pixiv_link", site: "pixiv" },
  ],
  studio: [
    { field: "mal_link", site: "MyAnimeList" },
    { field: "anilist_link", site: "AniList" },
    { field: "website_url", site: "Website" },
  ],
  // MAL has no record of a games publisher or a Taiwanese distributor, so a
  // publisher carries its website only.
  publisher: [{ field: "website_url", site: "Website" }],
  // An identity shows its character's, so it reads this list too.
  character: [
    { field: "mal_link", site: "MyAnimeList" },
    { field: "anilist_link", site: "AniList" },
  ],
};

export default function EntityLinksCard({ item, links }) {
  const shown = links.filter(({ field }) => Boolean(item?.[field]));
  if (shown.length === 0) return null;
  return (
    <Slip title="Links" padded={false} aria-label="Links">
      {shown.map(({ field, site }) => (
        <SourceLink key={field} href={item[field]} icon={sourceIconUrl(site)}>
          {site}
        </SourceLink>
      ))}
    </Slip>
  );
}
