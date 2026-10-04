// Frontend: the FilterDefs of the entity libraries - character, person (and
// its seiyuu view), studio and publisher.
//
// Every entity library filters one list the API already returned,
// client-side, with the same FilterDef machinery the media libraries use
// (FilterPanel, useFilterState, applyFilterDefs): OR inside a group, AND
// across groups. The entry-type group reads the `media_types` each row
// carries - the types of the entries the viewer can see it on - puts the
// gated types under a "Restricted" parent chip, and offers "No entries" for
// a row with none. A gated type the session may not see is left out
// (canSeeGatedType), and the parent with it once none is left.
//
// Every entity library opens on defaultEntityFilters(defs): every
// non-restricted type and No entries on, the restricted types off. So an
// entity only ever credited on a gated type is hidden until Restricted is
// ticked, while one nobody has credited yet (a new seiyuu) is still listed.
import { CHARACTER_ROLES, GENDERS, MY_RATINGS } from "../config/fieldOptions";
import { mediaTypeLabel } from "../config/mediaRegistry";
import { PERSON_SUB_TABS } from "../components/forms/PersonSubTabBar";
import { PUBLISHER_SCOPES } from "../components/forms/PublisherScopePills";
import { canSeeGatedType, visibleByType } from "./gatedTypes";
import { initialFilters } from "./libraryFilters";

export const UNRATED = "Unrated";
export const GENDER_NOT_SET = "Not set";
export const ROLE_NOT_SET = "Not set";
export const COUNTRY_NOT_SET = "Not set";
export const TAGS_NOT_SET = "Not set";
// The entry-type chip for a row whose media_types is empty.
export const NO_ENTRIES = "No entries";

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

// A studio is credited on an anime, an anime movie or a game, and on the
// hentai and h-game the gated side offers (the studio credit role's legal
// scopes in app/utils/credit_roles.py).
export const STUDIO_MEDIA_TYPES = ["anime", "anime-movie", "game"];
export const STUDIO_RESTRICTED_TYPES = ["hentai", "h-game"];

// A publisher is credited on the six types its scope pills offer; none is
// gated.
export const PUBLISHER_MEDIA_TYPES = PUBLISHER_SCOPES.map((s) => s.key);

const MEDIA_TYPE_KEY = "mediaType";

/**
 * The entry-type group. `typesOf(item)` is what a row is matched on - its
 * media_types, unless the caller widens it (a publisher adds its scopes).
 * No entries matches a row whose own media_types is empty, whatever else
 * typesOf returns.
 */
function mediaTypeDef(auth, types, restricted, typesOf = (item) => item.media_types || []) {
  const children = restricted.filter((type) => canSeeGatedType(auth, type));
  return {
    key: MEDIA_TYPE_KEY,
    label: "Entry type",
    type: "set",
    options: [...types, NO_ENTRIES],
    optionLabel: (value) => (value === NO_ENTRIES ? NO_ENTRIES : mediaTypeLabel(value)),
    ...(children.length > 0
      ? { parent: { label: "Restricted", children } }
      : {}),
    match: (item, active) =>
      typesOf(item).some((t) => active.has(t)) ||
      ((item.media_types || []).length === 0 && active.has(NO_ENTRIES)),
  };
}

/**
 * The state every entity library opens on: the entry-type group holds its
 * plain options - every non-restricted type and No entries - and nothing
 * else is on. The Restricted parent's children are not options, so they
 * start off. Handed to useFilterState as its `initial`, which is also what
 * resetFilters returns to.
 */
export function defaultEntityFilters(defs) {
  const filters = initialFilters(defs);
  const mediaType = defs.find((fd) => fd.key === MEDIA_TYPE_KEY);
  if (mediaType) filters[mediaType.key] = new Set(mediaType.options);
  return filters;
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

/**
 * A group over one of a character's tag lists (appearance, trait): the values
 * the loaded rows hold, sorted, plus Not set when a row's list is empty. A
 * row matches when it holds ANY ticked value, or has none and Not set is on.
 */
function tagListDef(key, label) {
  return {
    key,
    label,
    type: "set-dynamic",
    deriveOptions: (rows) => {
      const values = [...new Set(rows.flatMap((r) => r[key] || []))].sort();
      return rows.some((r) => !(r[key] || []).length) ? [...values, TAGS_NOT_SET] : values;
    },
    match: (item, active) => {
      const values = item[key] || [];
      return values.length === 0
        ? active.has(TAGS_NOT_SET)
        : values.some((v) => active.has(v));
    },
  };
}

/** The character library's defs: entry type, role, rating, gender, appearance, trait. */
export function characterFilterDefs(auth) {
  return [
    mediaTypeDef(auth, CHARACTER_MEDIA_TYPES, CHARACTER_RESTRICTED_TYPES),
    characterRoleDef(),
    ratingDef,
    genderDef(),
    tagListDef("appearance", "Appearance"),
    tagListDef("trait", "Trait"),
  ];
}

/**
 * The person library's defs: entry type, rating and gender, plus the person
 * types (director, author, ...) the admin sub-tabs split people by, matched
 * against the `roles` each person holds. A library already narrowed to one
 * role (`role`, the seiyuu view) has no Type group: every row holds it.
 */
export function personFilterDefs(auth, role = null) {
  const common = [
    mediaTypeDef(auth, PERSON_MEDIA_TYPES, PERSON_RESTRICTED_TYPES),
    ratingDef,
    genderDef(),
  ];
  if (role) return common;
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
    ...common,
  ];
}

// The countries on record, sorted, plus Not set when a row has none.
const countryDef = {
  key: "country",
  label: "Country",
  type: "set-dynamic",
  deriveOptions: (rows) => {
    const countries = [...new Set(rows.map((r) => r.country).filter(Boolean))].sort();
    return rows.some((r) => !r.country) ? [...countries, COUNTRY_NOT_SET] : countries;
  },
  match: (item, active) => active.has(item.country || COUNTRY_NOT_SET),
};

/** The studio library's defs: entry type, rating, country. */
export function studioFilterDefs(auth) {
  return [
    mediaTypeDef(auth, STUDIO_MEDIA_TYPES, STUDIO_RESTRICTED_TYPES),
    ratingDef,
    countryDef,
  ];
}

/**
 * The publisher library's defs: entry type, rating, country. The entry type
 * matches the types a publisher is credited on OR offered on (`scopes`), so
 * one offered on manga but not yet credited is still found under Manga.
 */
export function publisherFilterDefs(auth) {
  return [
    mediaTypeDef(auth, PUBLISHER_MEDIA_TYPES, [], (item) => [
      ...(item.media_types || []),
      ...(item.scopes || []),
    ]),
    ratingDef,
    countryDef,
  ];
}
