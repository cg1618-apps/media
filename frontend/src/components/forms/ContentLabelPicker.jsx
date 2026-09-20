// Frontend: pick the content labels a thing carries.
//
// Rendered once on Add and once on Modify rather than inside each of the
// per-type tabs, because labels are the same keys for every media type and
// duplicating the control is that many places to forget.
//
// The control is OWNER-AGNOSTIC. A media entry and a franchise are the same
// checkbox list against the same vocabulary, differing only in which URL the
// set is read from and written to, so one `owner` prop carries both rather
// than a second near-identical component drifting away from this one.
//
// On Add the thing has no id until the create call returns, so the parent
// holds the selection in state and PUTs it afterwards - the same
// create-then-PUT order the credits control already uses.
import { useCallback, useEffect, useState } from "react";

import { fetchJson } from "../../api/client";
import { endpoints } from "../../api/endpoints";

// { kind: "entry", mediaType, id } | { kind: "franchise", id } -> URL.
// Returns null when the owner has no id yet (the Add page), which is the
// signal not to read or write anything.
function ownerUrl(owner) {
  if (!owner?.id) return null;
  if (owner.kind === "franchise") {
    return endpoints.contentLabels.forFranchise(owner.id);
  }
  if (!owner.mediaType) return null;
  return endpoints.contentLabels.forEntry(owner.mediaType, owner.id);
}

export default function ContentLabelPicker({
  value = [],
  onChange,
  disabled,
  owner,
  // What the footnote says is hidden. A franchise's labels cascade to its
  // entries, so saying "this entry" there would understate it by a whole
  // franchise.
  scopeNote = "A labelled entry is hidden from anyone whose active mode does not carry that label.",
}) {
  const [labels, setLabels] = useState([]);
  const [failed, setFailed] = useState(false);
  const url = ownerUrl(owner);

  useEffect(() => {
    let alive = true;
    fetchJson(endpoints.contentLabels.list())
      .then((rows) => alive && setLabels(rows))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  // On Modify a thing is picked after the page has mounted, so the current
  // selection is read here rather than in each of the per-type effects.
  useEffect(() => {
    if (!url) return undefined;
    let alive = true;
    // Clear the previous selection first: a failed fetch must not leave those
    // labels behind to be saved onto this one.
    onChange([]);
    fetchJson(url)
      .then((keys) => alive && onChange(keys))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
    // onChange is a setState, stable enough; re-running on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const toggle = useCallback(
    (key) => {
      const held = new Set(value);
      if (held.has(key)) held.delete(key);
      else held.add(key);
      onChange([...held].sort());
    },
    [value, onChange],
  );

  // Nothing defined means nothing to restrict - draw no empty box.
  if (failed || labels.length === 0) return null;

  return (
    <div className="border border-border rounded-lg p-3">
      <h4 className="text-xs font-bold text-text-muted uppercase mb-2">
        Content Labels
      </h4>
      <div className="flex flex-wrap gap-3">
        {labels.map((row) => (
          <label
            key={row.system_id}
            className="flex items-center gap-1.5 text-sm cursor-pointer"
            title={row.description || ""}
          >
            <input
              type="checkbox"
              disabled={disabled}
              checked={value.includes(row.key)}
              onChange={() => toggle(row.key)}
            />
            {row.label}
          </label>
        ))}
      </div>
      <p className="text-[11px] text-text-faint mt-2">{scopeNote}</p>
    </div>
  );
}

// Every Add/Modify tab whose thing can carry a content label, declared once
// so the two pages cannot drift. They already had: "game" was missing from
// Add's list while its submit wrote labels anyway, so a game could be
// labelled on Modify and never on Add.
export const LABELLABLE_TABS = [
  "anime",
  "anime-movie",
  "movie",
  "tv-show",
  "cartoon",
  "manga",
  "novel",
  "comic",
  "game",
  "franchise",
];

// What the picker says under a franchise's checkboxes. Kept beside the
// default so the two readings of "what does this hide" sit together.
export const FRANCHISE_SCOPE_NOTE =
  "A labelled franchise is hidden from anyone whose active mode does not carry that label - and so is every entry in it.";

// Save an entry's labels. Call after a create returns its system_id, or after
// a modify submit. Failure is reported to the caller rather than swallowed:
// the entry saved, but its visibility did not.
export async function saveEntryLabels(mediaType, entryId, labelKeys) {
  return saveLabels(endpoints.contentLabels.forEntry(mediaType, entryId), labelKeys);
}

// The same for a franchise.
export async function saveFranchiseLabels(franchiseId, labelKeys) {
  return saveLabels(endpoints.contentLabels.forFranchise(franchiseId), labelKeys);
}

function saveLabels(url, labelKeys) {
  return fetchJson(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label_keys: labelKeys }),
  });
}
