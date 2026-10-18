// Fetches the suggestion lists every "tags" field on the Add/Modify/Defaults
// pages draws from: /api/options (all categories, fetched once and filtered
// client-side — the response carries category+scopes), /api/studio (one flat
// list — a studio has no role/scope concept), /api/person, fetched once per
// distinct {role, scope} pair used across fieldMeta.js's source descriptors,
// and /api/publisher, fetched once per distinct scope. Person and publisher
// responses do not carry the axis they are filtered on in a form the picker
// can use, so the server does that filtering, not the client. Beside them,
// /api/credits/usage once: per media type, how many entries use each value,
// which lib/suggestionOrder.js orders the lists by (and scopes a studio
// field's empty box with). The lists themselves keep the order every other
// page reads them in.
import { endpoints } from "../api/endpoints";
import {
  PERSON_SOURCES,
  PUBLISHER_SOURCES,
} from "../config/formFields/fieldMeta";

function personKey(role, scope) {
  return `${role}|${scope || ""}`;
}

async function readJsonArray(res) {
  if (!res || !res.ok) return [];
  try {
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function readJsonObject(res) {
  if (!res || !res.ok) return null;
  try {
    const data = await res.json();
    return data && typeof data === "object" && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

/**
 * Fetches { options, studios, publishers, people, usage } — the "sources"
 * bag getSourceValues() reads. `studios` is one flat list because a studio is
 * a studio wherever it is credited; `publishers` is a map keyed by media
 * type, because a publisher is offered only on the types its publisher_scope
 * rows name — a games publisher must not be suggested as an anime
 * distributor. `usage` is null when the counts could not be read; the lists
 * then keep their own order and a studio field offers every studio.
 */
export async function fetchAllSources() {
  const responses = await Promise.all([
    fetch(endpoints.options.list(), { credentials: "include" }),
    fetch(endpoints.studio.list(), { credentials: "include" }),
    fetch(endpoints.credits.usage(), { credentials: "include" }),
    ...PUBLISHER_SOURCES.map((scope) => {
      const qs = new URLSearchParams();
      qs.set("scope", scope);
      return fetch(endpoints.publisher.list(qs.toString()), {
        credentials: "include",
      });
    }),
    ...PERSON_SOURCES.map((s) => {
      const qs = new URLSearchParams();
      qs.set("role", s.role);
      if (s.scope) qs.set("scope", s.scope);
      return fetch(endpoints.person.list(qs.toString()), {
        credentials: "include",
      });
    }),
  ]);

  const [optionsRes, studiosRes, usageRes, ...rest] = responses;
  const publishersRes = rest.slice(0, PUBLISHER_SOURCES.length);
  const peopleRes = rest.slice(PUBLISHER_SOURCES.length);

  const options = await readJsonArray(optionsRes);
  const studios = await readJsonArray(studiosRes);
  const publishers = {};
  for (let i = 0; i < PUBLISHER_SOURCES.length; i++) {
    publishers[PUBLISHER_SOURCES[i]] = await readJsonArray(publishersRes[i]);
  }
  const people = {};
  for (let i = 0; i < PERSON_SOURCES.length; i++) {
    const s = PERSON_SOURCES[i];
    people[personKey(s.role, s.scope)] = await readJsonArray(peopleRes[i]);
  }

  const usage = await readJsonObject(usageRes);

  return { options, studios, publishers, people, usage };
}

export { personKey };
