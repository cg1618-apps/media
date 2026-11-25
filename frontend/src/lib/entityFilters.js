// Frontend: the FilterDefs of the entity libraries - character, person,
// studio and publisher (which adds a Kind group, see PUBLISHER_KINDS).
//
// Every library opens its filters with Entry type and closes its ordinary
// ones with My Rating; what sits between is the entity's own.
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
// Every entity library opens with no entry type ticked, which reads as every
// non-restricted type and No entries: the group's `idle` rule keeps every row
// but one whose entries are all of restricted types. So an entity only ever
// credited on a gated type is hidden until Restricted (or one of its types)
// is ticked, while one nobody has credited yet (a new seiyuu) is still listed.
import { CHARACTER_ROLES, GENDERS, PERSON_GENDERS } from "../config/fieldOptions";
import { mediaTypeLabel } from "../config/mediaRegistry";
import { PERSON_SUB_TABS, personTypeLabel } from "../components/forms/PersonSubTabBar";
import { PUBLISHER_SCOPES } from "../components/forms/PublisherScopePills";
import { canSeeGatedType, visibleByType } from "./gatedTypes";
import { UNRATED, myRatingFilter } from "./libraryFilterDefs";
import {
  CARD_KIND_CHARACTER,
  CARD_KIND_IDENTITY,
  HAS_IDENTITIES,
  NO_IDENTITIES,
} from "./characterCards";

export { UNRATED };
export const GENDER_NOT_SET = "Not set";
export const ROLE_NOT_SET = "Not set";
export const COUNTRY_NOT_SET = "Not set";
// The studio Country chip for every country that has no chip of its own.
export const COUNTRY_OTHERS = "Others";
// A country gets its own studio chip when MORE than this many studios name it.
export const COUNTRY_CHIP_MIN_EXCLUSIVE = 5;
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
    // Nothing ticked is the same as every plain option ticked: a row with no
    // entries, or with any type that is not restricted.
    idle: (item) => {
      const own = typesOf(item);
      return own.length === 0 || own.some((t) => !restricted.includes(t));
    },
  };
}

// The viewer's own rating (self.list), the last of every library's ordinary
// filters. Every *FilterDefs takes `{ ownData }` and leaves the group out when
// it is false: a viewer without self.list has no rating of its own, so the
// group would offer only chips nothing can match.
function ratingDefs(ownData) {
  return ownData ? [myRatingFilter()] : [];
}

/**
 * The distinct values `valuesOf(row)` returns across `rows`, the most-carried
 * first: a value counts once per row that carries it, and a tie reads in name
 * order.
 */
export function valuesByCount(rows, valuesOf) {
  const counts = new Map();
  for (const row of rows || []) {
    for (const v of new Set(valuesOf(row))) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b));
}

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
 * the loaded rows hold, the most-carried first (valuesByCount), plus Not set
 * last when a row's list is empty. A row matches when it holds ANY ticked
 * value, or has none and Not set is on. Drawn in the advanced section.
 */
function tagListDef(key, label) {
  return {
    key,
    label,
    type: "set-dynamic",
    advanced: true,
    deriveOptions: (rows) => {
      const values = valuesByCount(rows, (r) => r[key] || []);
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
// (the default) shows both. Advanced, as is the Identities group below.
const cardKindDef = {
  key: "cardKind",
  label: "Card",
  type: "set",
  advanced: true,
  options: [CARD_KIND_CHARACTER, CARD_KIND_IDENTITY],
  match: (item, active) =>
    active.has(item.card_kind === "identity" ? CARD_KIND_IDENTITY : CARD_KIND_CHARACTER),
};

// Whether the character has other identities. An identity card always does.
const hasIdentitiesDef = {
  key: "hasIdentities",
  label: "Identities",
  type: "set",
  advanced: true,
  options: [HAS_IDENTITIES, NO_IDENTITIES],
  match: (item, active) => active.has(item.has_identities ? HAS_IDENTITIES : NO_IDENTITIES),
};

/**
 * The character library's defs: entry type, role, gender, rating; then, in the
 * advanced section, the card kind and identities groups over its character
 * and identity cards, and appearance and trait.
 */
export function characterFilterDefs(auth, { ownData = true } = {}) {
  return [
    mediaTypeDef(auth, CHARACTER_MEDIA_TYPES, CHARACTER_RESTRICTED_TYPES),
    characterRoleDef(),
    genderDef(),
    ...ratingDefs(ownData),
    cardKindDef,
    hasIdentitiesDef,
    tagListDef("appearance", "Appearance"),
    tagListDef("trait", "Trait"),
  ];
}

/**
 * The person library's defs: entry type, then the person types (director,
 * author, ...) the admin sub-tabs split people by - matched against the
 * `roles` each person holds and named in Chinese (personTypeLabel) - then
 * gender and rating. A seiyuu is found under the Type group's 聲優.
 */
export function personFilterDefs(auth, { ownData = true } = {}) {
  const roleTabs = visibleByType(auth, PERSON_SUB_TABS, (t) => t.gatedType);
  return [
    mediaTypeDef(auth, PERSON_MEDIA_TYPES, PERSON_RESTRICTED_TYPES),
    {
      key: "role",
      label: "Type",
      type: "set",
      options: roleTabs.map((t) => t.key),
      optionLabel: personTypeLabel,
      match: (item, active) => (item.roles || []).some((r) => active.has(r.role)),
    },
    genderDef(PERSON_GENDERS),
    ...ratingDefs(ownData),
  ];
}

// The publisher's one country: the countries on record, the most-named first
// (valuesByCount), plus Not set last when a row has none.
const countryDef = {
  key: "country",
  label: "Country",
  type: "set-dynamic",
  deriveOptions: (rows) => {
    const countries = valuesByCount(rows, (r) => (r.country ? [r.country] : []));
    return rows.some((r) => !r.country) ? [...countries, COUNTRY_NOT_SET] : countries;
  },
  match: (item, active) => active.has(item.country || COUNTRY_NOT_SET),
};

export const HAS_RELATIONS = "Has relation";
export const NO_RELATIONS = "No relation";

// Read off the list's has_relations, which counts only related companies -
// studios and publishers - the viewer may see, so a relation to a hidden one
// filters as no relation. Shared by the studio and publisher libraries.
const companyRelationDef = {
  key: "relation",
  label: "Relation",
  type: "set",
  options: [HAS_RELATIONS, NO_RELATIONS],
  match: (item, active) => active.has(item.has_relations ? HAS_RELATIONS : NO_RELATIONS),
};

/**
 * The countries a studio Country chip of its own goes to: those more than
 * COUNTRY_CHIP_MIN_EXCLUSIVE of `rows` name, the most-named first, ties by
 * name. A studio naming several countries counts once for each.
 */
export function studioChipCountries(rows) {
  const counts = new Map();
  for (const row of rows || []) {
    for (const country of new Set(row.countries || [])) {
      counts.set(country, (counts.get(country) ?? 0) + 1);
    }
  }
  return [...counts]
    .filter(([, n]) => n > COUNTRY_CHIP_MIN_EXCLUSIVE)
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .map(([country]) => country);
}

/**
 * A studio's countries are a list, and only the common ones get a chip: the
 * chip countries of `rows` (studioChipCountries), then Others for a studio
 * naming any country without a chip, then Not set for one naming none - each
 * of the two only when a row needs it. A studio matches every chip one of its
 * countries falls under.
 */
function studioCountryDef(rows) {
  const chips = new Set(studioChipCountries(rows));
  const chipsOf = (item) => {
    const countries = item.countries || [];
    if (countries.length === 0) return [COUNTRY_NOT_SET];
    return countries.map((c) => (chips.has(c) ? c : COUNTRY_OTHERS));
  };
  return {
    key: "country",
    label: "Country",
    type: "set-dynamic",
    deriveOptions: (data) => {
      const listed = studioChipCountries(data);
      const shown = new Set(listed);
      const rest = (data || []).map((r) => r.countries || []);
      return [
        ...listed,
        ...(rest.some((cs) => cs.some((c) => !shown.has(c))) ? [COUNTRY_OTHERS] : []),
        ...(rest.some((cs) => cs.length === 0) ? [COUNTRY_NOT_SET] : []),
      ];
    },
    match: (item, active) => chipsOf(item).some((chip) => active.has(chip)),
  };
}

/**
 * The studio library's defs: entry type, country, relation, rating. `studios`
 * is the list the library filters: which countries get a chip of their own is
 * decided over it.
 */
export function studioFilterDefs(auth, { ownData = true, studios = [] } = {}) {
  return [
    mediaTypeDef(auth, STUDIO_MEDIA_TYPES, STUDIO_RESTRICTED_TYPES),
    studioCountryDef(studios),
    companyRelationDef,
    ...ratingDefs(ownData),
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
 * The publisher library's defs: entry type, kind, country, relation, rating.
 * Kind and entry type both match the types a publisher is credited on OR
 * offered on.
 */
export function publisherFilterDefs(auth, { ownData = true } = {}) {
  return [
    mediaTypeDef(auth, PUBLISHER_MEDIA_TYPES, [], publisherTypes),
    publisherKindDef(),
    countryDef,
    companyRelationDef,
    ...ratingDefs(ownData),
  ];
}

/**
 * The PUBLISHER_KINDS labels a publisher falls under, in PUBLISHER_KINDS
 * order, then 其他 when a type it covers has no kind - the Kind group's own
 * matching, as text for the publisher library's list view.
 */
export function publisherKindLabels(item) {
  const keys = new Set(publisherTypes(item).map((t) => KIND_OF_TYPE[t] ?? OTHER_PUBLISHERS.key));
  return [...PUBLISHER_KINDS, OTHER_PUBLISHERS].filter((k) => keys.has(k.key)).map((k) => k.label);
}
