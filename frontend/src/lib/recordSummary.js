// What a record's summary card shows (components/info/RecordSummaryCard.jsx),
// per type: its picture, its other names, a few label/value facts, its links
// and - for an entity - where its credited entries come from. The admin
// Delete page draws one for the record picked for deletion and one for a
// merge target, so two similarly named records can be told apart before
// anything is confirmed.
//
// Everything here is read off the list row the page already holds; the only
// extra request is an entity's /entries, which the card makes itself.
import { endpoints } from "../api/endpoints";
import { ENTITY_LINKS } from "../components/info/EntityLinksCard";
import { personTypeLabel } from "../components/forms/PersonSubTabBar";
import { mediaTypeLabel } from "../config/mediaRegistry";
import { formatCountries } from "./countries";
import { getNamingFields } from "./naming";
import { primaryReleaseValue } from "./releaseDate";

const plural = (n, word) => `${n ?? 0} ${word}${n === 1 ? "" : "s"}`;
const joined = (values, sep = " · ") => values.filter(Boolean).join(sep);

// A founded and a defunct date as one span, "1985 – 2005" or "1985 –".
function activeSpan(record) {
  if (!record.founded_date && !record.defunct_date) return "";
  return `${record.founded_date || "?"} – ${record.defunct_date || ""}`.trim();
}

// A person's roles, one line per role with the media types it is held in:
// "作家: Manga, Book". A role held in no media type yet says so.
export function personRoleLines(person) {
  const byRole = new Map();
  for (const { role, scope } of person.roles || []) {
    if (!byRole.has(role)) byRole.set(role, []);
    if (scope) byRole.get(role).push(mediaTypeLabel(scope));
  }
  return [...byRole].map(
    ([role, scopes]) => `${personTypeLabel(role)}: ${scopes.join(", ") || "no media type"}`,
  );
}

const scopesOf = (types) => joined((types || []).map(mediaTypeLabel), ", ");

const photo = (r) => ({
  file: r.display_photo_file ?? r.photo_file,
  focus: r.display_photo_focus ?? r.photo_focus,
});
const logo = (r) => ({
  file: r.display_logo_file ?? r.logo_file,
  focus: r.display_logo_focus ?? r.logo_focus,
});
const cover = (r) => ({ file: r.cover_image_file, focus: r.cover_image_focus });

const ENTITIES = {
  person: {
    image: photo,
    count: (r) => plural(r.credit_count, "credit"),
    entries: endpoints.person.entries,
    links: ENTITY_LINKS.person,
    facts: (r) => [
      ["Gender", r.gender],
      ["Roles", personRoleLines(r)],
      ["Affiliations", joined((r.affiliations || []).map((a) => a.display_name), ", ")],
    ],
  },
  character: {
    image: photo,
    count: (r) => plural(r.casting_count, "casting"),
    entries: endpoints.character.entries,
    links: ENTITY_LINKS.character,
    facts: (r) => [
      ["Gender", r.gender],
      ["Role", r.role],
      ["Media types", scopesOf(r.media_types)],
      ["Identities", joined((r.identities || []).map((i) => i.display_name), ", ")],
      ["First appearance", r.first_appearance],
    ],
  },
  identity: {
    image: photo,
    count: (r) => plural(r.casting_count, "cast row"),
    entries: endpoints.characterIdentity.entries,
    links: [],
    facts: (r) => [
      ["Character", r.character_display_name],
      ["Gender", r.display_gender ?? r.gender],
      ["First appearance", r.first_appearance],
    ],
  },
  studio: {
    image: logo,
    count: (r) => plural(r.credit_count, "credit"),
    entries: endpoints.studio.entries,
    links: ENTITY_LINKS.studio,
    facts: (r) => [
      ["Countries", r.countries?.length ? formatCountries(r.countries) : ""],
      ["Active", activeSpan(r)],
      ["Media types", scopesOf(r.media_types)],
    ],
  },
  publisher: {
    image: logo,
    count: (r) => plural(r.credit_count, "credit"),
    entries: endpoints.publisher.entries,
    links: ENTITY_LINKS.publisher,
    facts: (r) => [
      ["Country", r.country],
      ["Active", activeSpan(r)],
      ["Scopes", scopesOf(r.scopes)],
    ],
  },
};

// Per media type: the columns that say what kind of entry it is, and the
// columns that say where it stands. Read off each type's list row.
const ENTRY_COLUMNS = {
  anime: { kind: ["airing_type"], status: ["airing_status", "watching_status"] },
  "anime-movie": { kind: [], status: ["release_status", "watching_status"] },
  movie: { kind: ["movie_type"], status: ["release_status", "watching_status"] },
  "tv-show": { kind: ["airing_type", "season_part"], status: ["airing_status", "watching_status"] },
  cartoon: { kind: ["season_part"], status: ["airing_status", "watching_status"] },
  manga: { kind: ["region"], status: ["reading_status"] },
  book: { kind: ["type", "region"], status: ["reading_status"] },
  comic: { kind: ["comic_type", "volume_label"], status: ["reading_status"] },
  game: { kind: ["game_type", "ownership"], status: ["playing_status"] },
  "h-comic": { kind: ["region"], status: ["serialization_status", "reading_status"] },
  "h-game": { kind: ["game_type", "playstyle"], status: ["playing_status"] },
  hentai: { kind: ["source_material"], status: ["airing_status", "watching_status"] },
};

// The extra facts one type has that the others do not.
const ENTRY_EXTRAS = {
  comic: (r) => [
    ["Publisher", r.publisher],
    ["Issues", r.issue_total ? `${r.issue_fin ?? 0} / ${r.issue_total}` : ""],
  ],
  game: (r) => [["Hours played", r.hours_played != null ? String(r.hours_played) : ""]],
};

/** The summary spec of `type`: `kind` is "entity", "entry" or "group". */
export function summarySpec(type) {
  if (ENTITIES[type]) return { kind: "entity", ...ENTITIES[type] };
  if (ENTRY_COLUMNS[type]) return { kind: "entry", image: cover };
  return { kind: "group" };
}

// Series is the one tier NAMING_CONFIGS leaves out.
const SERIES_NAMES = [
  ["Chinese", "series_name_cn"],
  ["English", "series_name_en"],
  ["Alternative", "series_name_alt"],
];

/** Every name the record holds, labelled, in its naming card's order. */
export function summaryNames(type, record) {
  const fields =
    type === "series"
      ? SERIES_NAMES.map(([label, field]) => ({ label, value: record[field] }))
      : getNamingFields(record, type);
  return fields.filter((f) => f.value);
}

/**
 * The label/value facts the card lists, empty values dropped. A value may be
 * an array, drawn one per line. `context` carries what the row only holds by
 * id: the franchise and series names the page resolves.
 */
export function summaryFacts(type, record, context = {}) {
  const spec = summarySpec(type);
  let facts;
  if (spec.kind === "entity") {
    facts = spec.facts(record);
  } else if (spec.kind === "entry") {
    const { kind, status } = ENTRY_COLUMNS[type];
    facts = [
      ["Type", joined([mediaTypeLabel(type), ...kind.map((c) => record[c])])],
      ["Released", primaryReleaseValue(type, record)],
      ["Status", joined(status.map((c) => record[c]))],
      ["Franchise", context.franchise],
      ["Series", context.series],
      ...(ENTRY_EXTRAS[type]?.(record) || []),
    ];
  } else {
    facts = [
      ["Type", record.franchise_type],
      ["Franchise", context.franchise],
    ];
  }
  return facts
    .filter(([, value]) => (Array.isArray(value) ? value.length > 0 : Boolean(value)))
    .map(([label, value]) => ({ label, value }));
}

/** The external links the record has filled, as [{site, href}]. */
export function summaryLinks(type, record) {
  return (summarySpec(type).links || [])
    .filter(({ field }) => record[field])
    .map(({ field, site }) => ({ site, href: record[field] }));
}

/**
 * An entity's /entries answer - groups by media type (and role, for a
 * person) - as one list of distinct entries, newest first. An entry credited
 * in several groups appears once, carrying every group label it sits under.
 */
export function flattenEntryGroups(groups = []) {
  const byKey = new Map();
  for (const group of groups) {
    for (const entry of group.entries || []) {
      const key = `${group.media_type}:${entry.system_id}`;
      const seen = byKey.get(key);
      if (seen) {
        if (group.label && !seen.labels.includes(group.label)) seen.labels.push(group.label);
        continue;
      }
      byKey.set(key, {
        ...entry,
        media_type: group.media_type,
        labels: group.label ? [group.label] : [],
      });
    }
  }
  return [...byKey.values()].sort((a, b) =>
    String(b.release_date || "").localeCompare(String(a.release_date || "")),
  );
}

/**
 * The one line a picker row shows under the name: the other names, then the
 * entity's type and its count. Enough to tell two "Kaori"s apart.
 */
export function summaryOptionLine(type, record, title) {
  const spec = summarySpec(type);
  const names = summaryNames(type, record)
    .map((n) => n.value)
    .filter((v) => v !== title);
  const kind =
    type === "person"
      ? (record.roles || []).length
        ? [...new Set(record.roles.map((r) => personTypeLabel(r.role)))].join("/")
        : ""
      : type === "character"
        ? record.role
        : type === "identity"
          ? record.character_display_name
          : "";
  return joined([...names, kind, spec.count?.(record)]);
}
