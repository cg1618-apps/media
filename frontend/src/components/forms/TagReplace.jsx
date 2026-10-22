// Frontend: form component file for TagReplace.
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

// "Replace genres & labels from…": the other entries of the form's series and
// franchise, of this media type, that carry at least one of `fields` - the
// series' first when the form has one. Picking one REPLACES each of `fields`
// with that entry's value, clearing a field the entry has empty; nothing is
// saved until the form is. Tags are scoped per media type
// (lib/genreLabelFields.js), so only entries of `mediaType` are offered.
// `what` names the fields in the picker's wording.
export default function TagReplace({
  mediaType,
  franchiseId,
  seriesId,
  entryId,
  fields,
  what = "genres & labels",
  onChange,
}) {
  const [entries, setEntries] = useState([]);
  const [message, setMessage] = useState("");

  // The list endpoint already filters by franchise and returns every tag
  // field and series_id, newest-made first, through the viewer's visibility
  // rules. The series split is made here, from that one list.
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
  const inSeries = seriesId ? sources.filter((e) => e.series_id === seriesId) : [];
  const elsewhere = seriesId ? sources.filter((e) => e.series_id !== seriesId) : sources;

  function replaceTags(entry) {
    for (const key of fields) onChange(key, splitTags(entry[key]).join(", "));
    setMessage(
      `Replaced ${what} with ${getDisplayName(entry, mediaType)}'s. Save to keep them.`,
    );
  }

  const option = (s) => (
    <option key={s.system_id} value={s.system_id}>
      {getDisplayName(s, mediaType)} ({tagCount(s)})
    </option>
  );

  if (sources.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 mt-3">
      <select
        className={pickerCls}
        value=""
        aria-label={`Replace ${what} from`}
        onChange={(e) => {
          const entry = sources.find((s) => s.system_id === e.target.value);
          if (entry) replaceTags(entry);
        }}
      >
        <option value="">Replace {what} from…</option>
        {seriesId ? (
          <>
            {inSeries.length > 0 && <optgroup label="This series">{inSeries.map(option)}</optgroup>}
            {elsewhere.length > 0 && (
              <optgroup label="Rest of the franchise">{elsewhere.map(option)}</optgroup>
            )}
          </>
        ) : (
          elsewhere.map(option)
        )}
      </select>
      {message && (
        <span className="text-xs text-text-muted" role="status">
          {message}
        </span>
      )}
    </div>
  );
}
