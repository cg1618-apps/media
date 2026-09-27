// Frontend: the FilterDefs of the character and person libraries.
//
// Both libraries filter one list the API already returned, client-side, with
// the same FilterDef machinery the media libraries use (FilterPanel,
// useFilterState, applyFilterDefs): OR inside a group, AND across groups.
// The media-type group reads the `media_types` each row carries - the types
// of the entries the viewer can see it on - and puts the gated types under a
// "Restricted" parent chip. A gated type the session may not see is left out
// (canSeeGatedType), and the parent with it once none is left.
import { CHARACTER_ROLES, GENDERS, MY_RATINGS } from "../config/fieldOptions";
import { mediaTypeLabel } from "../config/mediaRegistry";
import { PERSON_SUB_TABS } from "../components/forms/PersonSubTabBar";
import { canSeeGatedType, visibleByType } from "./gatedTypes";

export const UNRATED = "Unrated";
export const GENDER_NOT_SET = "Not set";
export const ROLE_NOT_SET = "Not set";

// A character is cast on an anime, an anime movie, a manga or a novel, and
// on the h-comic and hentai the gated side offers. H-game has no cast.
export const CHARACTER_MEDIA_TYPES = ["anime", "anime-movie", "manga", "novel"];
export const CHARACTER_RESTRICTED_TYPES = ["h-comic", "hentai"];

// A person can be credited on every type.
export const PERSON_MEDIA_TYPES = [
  "anime",
  "anime-movie",
  "movie",
  "tv-show",
  "cartoon",
  "manga",
  "novel",
  "comic",
  "game",
];
export const PERSON_RESTRICTED_TYPES = ["h-comic", "hentai", "h-game"];

function mediaTypeDef(auth, types, restricted) {
  const children = restricted.filter((type) => canSeeGatedType(auth, type));
  return {
    key: "mediaType",
    label: "Entry type",
    type: "set",
    options: types,
    optionLabel: mediaTypeLabel,
    ...(children.length > 0
      ? { parent: { label: "Restricted", children } }
      : {}),
    match: (item, active) => (item.media_types || []).some((t) => active.has(t)),
  };
}

const ratingDef = {
  key: "myRating",
  label: "My Rating",
  type: "set",
  options: [...MY_RATINGS, UNRATED],
  match: (item, active) => active.has(item.my_rating || UNRATED),
};

// Built per call rather than once: GENDERS is refreshed in place from
// /api/constants, and a def frozen at import time would keep the bundled copy.
function genderDef() {
  return {
    key: "gender",
    label: "Gender",
    type: "set",
    options: [...GENDERS, GENDER_NOT_SET],
    match: (item, active) => active.has(item.gender || GENDER_NOT_SET),
  };
}

// The character's OWN role (character.role), never the roles its castings
// carry. Built per call for the same reason as genderDef.
function characterRoleDef() {
  return {
    key: "role",
    label: "Role",
    type: "set",
    options: [...CHARACTER_ROLES, ROLE_NOT_SET],
    match: (item, active) => active.has(item.role || ROLE_NOT_SET),
  };
}

/** The character library's defs: entry type, role, rating, gender. */
export function characterFilterDefs(auth) {
  return [
    mediaTypeDef(auth, CHARACTER_MEDIA_TYPES, CHARACTER_RESTRICTED_TYPES),
    characterRoleDef(),
    ratingDef,
    genderDef(),
  ];
}

/**
 * The person library's defs: the character's three, plus the person types
 * (director, author, ...) the admin sub-tabs split people by, matched against
 * the `roles` each person holds.
 */
export function personFilterDefs(auth) {
  const roleTabs = visibleByType(auth, PERSON_SUB_TABS, (t) => t.gatedType);
  const roleLabels = Object.fromEntries(roleTabs.map((t) => [t.key, t.label]));
  return [
    {
      key: "role",
      label: "Type",
      type: "set",
      options: roleTabs.map((t) => t.key),
      optionLabel: (key) => roleLabels[key] ?? key,
      match: (item, active) => (item.roles || []).some((r) => active.has(r.role)),
    },
    mediaTypeDef(auth, PERSON_MEDIA_TYPES, PERSON_RESTRICTED_TYPES),
    ratingDef,
    genderDef(),
  ];
}
