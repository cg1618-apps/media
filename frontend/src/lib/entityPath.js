// Frontend: the one place that knows the shape of a detail-page URL.
//
// URLs are /<type>/<public_id>/<slug>. The slug is decorative - the router and
// the API both ignore it - so it can be derived on the fly and never goes
// stale when a title is edited.
//
// The slug deliberately does NOT use getDisplayName(), which leads with the
// Chinese name for every type but comic. A CJK slug percent-encodes to mush
// the moment it is copied out of the address bar, so the URL prefers Latin
// script and simply omits the slug when there is none. The UI still shows the
// CN name everywhere else.
import { useCallback } from "react";

import { useViewScope } from "../hooks/useViewScope";

const MAX_SLUG_LENGTH = 60;

// Route type -> name-column prefix. Mirrors getDisplayName in ./naming.js;
// only anime-movie, tv-show, h-comic and h-game are irregular.
function namePrefix(type) {
  if (type === "anime-movie") return "anime_movie";
  if (type === "tv-show") return "tv";
  if (type === "h-comic") return "h_comic";
  if (type === "h-game") return "h_game";
  return type;
}

export function slugify(text) {
  if (!text) return "";
  const ascii = String(text)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // combining marks left behind by NFKD
    .replace(/[^\x20-\x7E]/g, " "); // anything still non-ASCII, incl. CJK
  const slug = ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (slug.length <= MAX_SLUG_LENGTH) return slug;
  const cut = slug.slice(0, MAX_SLUG_LENGTH);
  const boundary = cut.lastIndexOf("-");
  return (boundary > 0 ? cut.slice(0, boundary) : cut).replace(/-$/, "");
}

export function entitySlug(type, entity) {
  if (!entity) return "";
  const prefix = namePrefix(type);
  const candidates = [
    entity[`${prefix}_name_en`],
    entity[`${prefix}_name_roman`],
    entity[`${prefix}_name_alt`],
    entity.name_en, // person, studio, publisher, character
    entity.name_alt,
    entity.list_name, // watch order
    // Credit refs and casting rows carry only a display_name. It leads with
    // the CN name for most types, but slugify() returns "" for CJK, so this
    // adds a slug when the name happens to be Latin and changes nothing when
    // it is not.
    entity.display_name,
  ];
  for (const candidate of candidates) {
    const slug = slugify(candidate);
    if (slug) return slug;
  }
  return "";
}

export function entityPath(type, entity) {
  if (!entity || entity.public_id == null) return "";
  const slug = entitySlug(type, entity);
  return slug ? `/${type}/${entity.public_id}/${slug}` : `/${type}/${entity.public_id}`;
}

// The credited entities, whose pages are a member's (view.entities). Every
// other type - a media entry, a group, a watch order - is open to a guest.
export const ENTITY_TYPES = new Set([
  "studio",
  "publisher",
  "person",
  "character",
  "identity",
]);

// entityPath for the current viewer: "" for an entity type when the viewer
// lacks view.entities, the same key App.jsx's entity routes ask. Every link
// component already reads "" as "no page to go to" and renders the name as
// plain text, so a guest reads who made an entry without being sent to a
// page that would only bounce them to the login screen. Outside an
// AuthProvider nobody is known to hold the key, so no entity link is drawn.
export function useEntityHref() {
  const { entities: linked } = useViewScope();
  return useCallback(
    (type, entity) =>
      ENTITY_TYPES.has(type) && !linked ? "" : entityPath(type, entity),
    [linked],
  );
}
