// Frontend: the FilterDefs of the entity libraries - character, person (and
// its seiyuu view), studio and publisher (which adds a Kind group, see
// PUBLISHER_KINDS).
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
import { CHARACTER_ROLES, GENDERS, MY_RATINGS, PERSON_GENDERS } from "../config/fieldOptions";
import { mediaTypeLabel } from "../config/mediaRegistry";
import { PERSON_SUB_TABS } from "../components/forms/PersonSubTabBar";
import { PUBLISHER_SCOPES } from "../components/forms/PublisherScopePills";
import { canSeeGatedType, visibleByType } from "./gatedTypes";
import { initialFilters } from "./libraryFilters";
import {
  CARD_KIND_CHARACTER,
  CARD_KIND_IDENTITY,
  HAS_IDENTITIES,
  NO_IDENTITIES,
} from "./characterCards";

export const UNRATED = "Unrated";
export const GENDER_NOT_SET = "Not set";
export const ROLE_NOT_SET = "Not set";
export const COUNTRY_NOT_SET = "Not set";
export const TAGS_NOT_SET = "Not set";
// The entry-type chip for a row whose media_types is empty.
export const NO_ENTRIES = "No entries";

// A character is cast on an anime, an anime movie, a manga, a book or a game,
// and on the h-comic and hentai the gated side offers. H-game has no cast.
export const CHARACTER_MEDIA_TYPES = ["anime", "anime-movie", "manga", "book", "game"];
export const CHARACTER_RESTRICTED_TYPES = ["h-comic", "hentai"];

// A person can be credited on every type.
export const PERSON_MEDIA_TYPES = [
  "anime",
  "anime-movie",
  "movie",
  "tv-show",
  "cartoon",
  "manga",
  "book",
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

// The kinds a publisher library row is grouped into, by the media types it
// covers. The grouping is the reader's, not the schema's: one `publisher`
// credit role spans six types, and what a reader means by "which publisher"
// is which of the backend's credit labels it carries (credit_label in
// app/utils/credit_roles.py) - 台灣代理商 on anime and anime-movie, 台灣出版社
// on manga and book, 發行商 on game. So the named kinds follow those labels,
// with the game one spelt out as 遊戲發行商 to read on its own as a chip; a
// change to who shares a label there is a change here. Every type no kind
// names (comic, 出版商, today) falls under OTHER_PUBLISHERS, so a type added
// to PUBLISHER_SCOPES is still filterable before anyone sorts it into a kind.
// None of the publisher types is gated, so there is nothing to hide here the
// way mediaTypeDef hides a gated type.
export const PUBLISHER_KINDS = [
  { key: "game", label: "遊戲發行商", mediaTypes: ["game"] },
  { key: "tw-publisher", label: "台灣出版社", mediaTypes: ["manga", "book"] },
  { key: "tw-distributor", label: "台灣代理商", mediaTypes: ["anime", "anime-movie"] },
];
export const OTHER_PUBLISHERS = { key: "other", label: "其他" };

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

// The viewer's own rating (self.list). Every *FilterDefs takes `{ ownData }`
// and leaves the group out when it is false: a viewer without self.list has no
// rating of its own, so the group would offer only chips nothing can match.
const ratingDef = {
  key: "myRating",
  label: "My Rating",
  type: "set",
  options: [...MY_RATINGS, UNRATED],
  match: (item, active) => active.has(item.my_rating || UNRATED),
};

// Built per call rather than once: GENDERS and PERSON_GENDERS are refreshed in
// place from /api/constants, and a def frozen at import time would keep the
// bundled copy. A person's vocabulary is the narrower one, 男 / 女.
function genderDef(genders = GENDERS) {
  return {
    key: "gender",
    label: "Gender",
    type: "set",
    options: [...genders, GENDER_NOT_SET],
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

// Character cards and identity cards, so either can be shown alone. Empty
// (the default) shows both.
const cardKindDef = {
  key: "cardKind",
  label: "Card",
  type: "set",
  options: [CARD_KIND_CHARACTER, CARD_KIND_IDENTITY],
  match: (item, active) =>
    active.has(item.card_kind === "identity" ? CARD_KIND_IDENTITY : CARD_KIND_CHARACTER),
};

// Whether the character has other identities. An identity card always does.
const hasIdentitiesDef = {
  key: "hasIdentities",
  label: "Identities",
  type: "set",
  options: [HAS_IDENTITIES, NO_IDENTITIES],
  match: (item, active) => active.has(item.has_identities ? HAS_IDENTITIES : NO_IDENTITIES),
};

/**
 * The character library's defs: entry type, role, rating, gender, appearance,
 * trait, and the card kind and identities groups over its character and
 * identity cards.
 */
export function characterFilterDefs(auth, { ownData = true } = {}) {
  return [
    mediaTypeDef(auth, CHARACTER_MEDIA_TYPES, CHARACTER_RESTRICTED_TYPES),
    characterRoleDef(),
    ...(ownData ? [ratingDef] : []),
    genderDef(),
    tagListDef("appearance", "Appearance"),
    tagListDef("trait", "Trait"),
    cardKindDef,
    hasIdentitiesDef,
  ];
}

/**
 * The person library's defs: entry type, rating and gender, plus the person
 * types (director, author, ...) the admin sub-tabs split people by, matched
 * against the `roles` each person holds. A library already narrowed to one
 * role (`role`, the seiyuu view) has no Type group: every row holds it.
 */
export function personFilterDefs(auth, role = null, { ownData = true } = {}) {
  const common = [
    mediaTypeDef(auth, PERSON_MEDIA_TYPES, PERSON_RESTRICTED_TYPES),
    ...(ownData ? [ratingDef] : []),
    genderDef(PERSON_GENDERS),
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

export const HAS_RELATIONS = "Has relation";
export const NO_RELATIONS = "No relation";

// Read off the list's has_relations, which counts only related studios the
// viewer may see - so a relation to a hidden studio filters as no relation.
const studioRelationDef = {
  key: "relation",
  label: "Relation",
  type: "set",
  options: [HAS_RELATIONS, NO_RELATIONS],
  match: (item, active) => active.has(item.has_relations ? HAS_RELATIONS : NO_RELATIONS),
};

/** The studio library's defs: entry type, rating, country, relation. */
export function studioFilterDefs(auth, { ownData = true } = {}) {
  return [
    mediaTypeDef(auth, STUDIO_MEDIA_TYPES, STUDIO_RESTRICTED_TYPES),
    ...(ownData ? [ratingDef] : []),
    countryDef,
    studioRelationDef,
  ];
}

// What a publisher row is matched on: the types it is credited on OR offered
// on (`scopes`), so one offered on manga but not yet credited still counts as
// a manga publisher.
function publisherTypes(item) {
  return [...(item.media_types || []), ...(item.scopes || [])];
}

const KIND_OF_TYPE = Object.fromEntries(
  PUBLISHER_KINDS.flatMap((kind) => kind.mediaTypes.map((type) => [type, kind.key])),
);

/**
 * The kind group (PUBLISHER_KINDS). A publisher covering several kinds
 * matches each of them; one covering no type at all matches none.
 */
function publisherKindDef() {
  const kinds = [...PUBLISHER_KINDS, OTHER_PUBLISHERS];
  const labels = Object.fromEntries(kinds.map((k) => [k.key, k.label]));
  return {
    key: "kind",
    label: "Kind",
    type: "set",
    options: kinds.map((k) => k.key),
    optionLabel: (key) => labels[key] ?? key,
    match: (item, active) =>
      publisherTypes(item).some((t) => active.has(KIND_OF_TYPE[t] ?? OTHER_PUBLISHERS.key)),
  };
}

/**
 * The publisher library's defs: kind, entry type, rating, country. Kind and
 * entry type both match the types a publisher is credited on OR offered on.
 */
export function publisherFilterDefs(auth, { ownData = true } = {}) {
  return [
    publisherKindDef(),
    mediaTypeDef(auth, PUBLISHER_MEDIA_TYPES, [], publisherTypes),
    ...(ownData ? [ratingDef] : []),
    countryDef,
  ];
}
