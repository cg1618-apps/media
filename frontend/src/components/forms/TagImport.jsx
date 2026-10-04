// Frontend: form component file for TagImport.
import { useEffect, useState } from "react";

import { endpoints } from "../../api/endpoints";
import { getDisplayName } from "../../lib/naming";

// The cast editor's picker style: a form control without the full width.
const pickerCls =
  "border border-border rounded-lg px-3 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand bg-surface";

function splitTags(value) {
  return (value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

// The form's tags followed by the incoming ones it does not already hold, as
// the comma-separated string MultiSelect edits. `added` counts the new ones.
export function mergeTags(current, incoming) {
  const held = splitTags(current);
  const fresh = splitTags(incoming).filter((v) => !held.includes(v));
  return { value: [...held, ...fresh].join(", "), added: fresh.length };
}

// "Import genres & labels from…": the other entries of the form's franchise,
// of this media type, that carry at least one of `fields`. Picking one appends
// its tags to the form's after the ones already there, the way the cast
// editor's import appends rows - nothing is saved until the form is.
// `fields` names the tag keys; `values` is the form state holding them.
export default function TagImport({
  mediaType,
  franchiseId,
  entryId,
  fields,
  values,
  onChange,
}) {
  const [entries, setEntries] = useState([]);
  const [message, setMessage] = useState("");

  // The list endpoint already filters by franchise and returns every tag
  // field, newest-made first, through the viewer's visibility rules.
  useEffect(() => {
    if (!franchiseId) return undefined;
    let cancelled = false;
    const qs = new URLSearchParams({ franchise_id: franchiseId }).toString();
    fetch(`${endpoints.resource(mediaType).list()}?${qs}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => {
        if (!cancelled) setEntries(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        /* best effort — the tags can still be picked by hand */
      });
    return () => {
      cancelled = true;
    };
  }, [mediaType, franchiseId]);

  const tagCount = (entry) =>
    fields.reduce((n, key) => n + splitTags(entry[key]).length, 0);

  // A stale list from a franchise the form has since cleared is not shown.
  const sources = franchiseId
    ? entries.filter((e) => e.system_id !== entryId && tagCount(e) > 0)
    : [];

  function importTags(entry) {
    let added = 0;
    let held = 0;
    for (const key of fields) {
      const merged = mergeTags(values[key], entry[key]);
      added += merged.added;
      held += splitTags(entry[key]).length - merged.added;
      if (merged.added) onChange(key, merged.value);
    }
    setMessage(
      `Imported ${added} from ${getDisplayName(entry, mediaType)}` +
        (held ? ` (${held} already here)` : "") +
        ". Save to keep them.",
    );
  }

  if (sources.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 mt-3">
      <select
        className={pickerCls}
        value=""
        aria-label="Import genres and labels from"
        onChange={(e) => {
          const entry = sources.find((s) => s.system_id === e.target.value);
          if (entry) importTags(entry);
        }}
      >
        <option value="">Import genres &amp; labels from…</option>
        {sources.map((s) => (
          <option key={s.system_id} value={s.system_id}>
            {getDisplayName(s, mediaType)} ({tagCount(s)})
          </option>
        ))}
      </select>
      {message && (
        <span className="text-xs text-text-muted" role="status">
          {message}
        </span>
      )}
    </div>
  );
}
