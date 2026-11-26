// Frontend: what the Data Control Log's Details popup reads out of a log
// row - how long the operation took, and the stored `details_json` drawn as
// labelled sections under the operation it belongs to.

// The keys an operation stores, in the order the popup draws them, with the
// label each is drawn under. A key not listed is drawn after these, under
// its own name, so a new detail shows up before anyone names it here.
const SECTIONS = [
  ["failed", "Failed entries"],
  ["unread", "Tabs not read"],
  ["unresolved_refs", "Unresolved references"],
  ["credit_conflicts", "Ambiguous links skipped"],
  ["created_entities", "Created from the sheet"],
  ["skipped_tabs", "Skipped tabs"],
  ["no_installation_owner", "No installation owner"],
  ["sequel_relations", "Sequel relations"],
  ["cast", "Cast fields filled"],
  ["display_names", "Display names set to CN"],
  ["missing_covers", "Missing covers"],
  ["unused_covers", "Unused covers"],
];
// Stored for the run's totals, which the operations' own rows already say.
const HIDDEN = new Set(["pulled"]);

function humanize(key) {
  const words = key.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function lines(value) {
  if (Array.isArray(value)) return value.map(String);
  if (value && typeof value === "object") {
    return Object.entries(value).map(([k, v]) => `${humanize(k)}: ${v}`);
  }
  return [String(value)];
}

function isEmpty(value) {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

// [{ key, label, lines }] for one row's `details_json`, empty ones left out.
// A value that is not JSON is drawn as it is, under "Details".
export function logDetailSections(detailsJson) {
  if (!detailsJson) return [];
  let details;
  try {
    details = JSON.parse(detailsJson);
  } catch {
    return [{ key: "raw", label: "Details", lines: [detailsJson] }];
  }
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return [{ key: "raw", label: "Details", lines: lines(details) }];
  }
  const known = new Map(SECTIONS);
  const keys = [
    ...SECTIONS.map(([key]) => key).filter((key) => key in details),
    ...Object.keys(details).filter((key) => !known.has(key) && !HIDDEN.has(key)),
  ];
  return keys
    .filter((key) => !isEmpty(details[key]))
    .map((key) => ({
      key,
      label: known.get(key) ?? humanize(key),
      lines: lines(details[key]),
    }));
}

// How long a row's operation took: "45s", "3m 12s", "1h 4m". "-" when the
// row recorded no start, which every row written before starts were
// recorded is.
export function formatLogDuration(startedAt, endedAt) {
  if (!startedAt || !endedAt) return "-";
  const seconds = Math.round((new Date(endedAt) - new Date(startedAt)) / 1000);
  if (!Number.isFinite(seconds) || seconds < 0) return "-";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
