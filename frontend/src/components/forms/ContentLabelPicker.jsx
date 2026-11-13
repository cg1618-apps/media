// Frontend: pick the content labels a thing carries.
//
// Rendered once on Add and once on Modify rather than inside each of the
// per-type tabs, because labels are the same keys for every media type and
// duplicating the control is that many places to forget.
//
// The control is OWNER-AGNOSTIC. A media entry and each grouping tier - a
// collection, a franchise, a series - are the same checkbox list against the
// same vocabulary, differing only in which URL the set is read from and
// written to, so one `owner` prop carries all four rather than a second
// near-identical component drifting away from this one.
//
// On Add the thing has no id until the create call returns, so the parent
// holds the selection in state and PUTs it afterwards - the same
// create-then-PUT order the credits control already uses.
import { useCallback, useEffect, useState } from "react";

import { fetchJson } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import {
  requiredLabelsForFranchiseType,
  requiredLabelsForType,
} from "../../lib/gatedTypes";

// Every other label is stored with nsfw (app/services/domain/label_rules.py):
// ticking one ticks NSFW, and NSFW cannot be unticked while one is held.
export const NSFW = "nsfw";

// `keys` plus nsfw when any other label is among them - the server's
// with_required_labels, so what the form shows is what the save stores.
export function withNsfw(keys) {
  const out = new Set(keys || []);
  if ([...out].some((key) => key !== NSFW)) out.add(NSFW);
  return [...out].sort();
}

// The label endpoint of each grouping tier, keyed by the owner's `kind`.
const GROUP_LABEL_URL = {
  collection: endpoints.contentLabels.forCollection,
  franchise: endpoints.contentLabels.forFranchise,
  series: endpoints.contentLabels.forSeries,
};

// { kind: "entry", mediaType, id } | { kind: "collection" | "franchise" |
// "series", id } -> URL. Returns null when the owner has no id yet (the Add
// page), which is the signal not to read or write anything.
function ownerUrl(owner) {
  if (!owner?.id) return null;
  if (GROUP_LABEL_URL[owner.kind]) return GROUP_LABEL_URL[owner.kind](owner.id);
  if (!owner.mediaType) return null;
  return endpoints.contentLabels.forEntry(owner.mediaType, owner.id);
}

export default function ContentLabelPicker({
  value = [],
  onChange,
  disabled,
  owner,
  // What the footnote says is hidden. A group's labels cascade to everything
  // under it, so saying "this entry" there would understate it by a whole
  // group (GROUP_SCOPE_NOTES).
  scopeNote = "A labelled entry is hidden from anyone whose active mode does not carry that label.",
  // Labels the thing must carry whatever the admin picks - a gated type's
  // required label (lib/gatedTypes.js). Drawn checked and locked; the savers
  // below add them to the set, so they need not be in `value`.
  required = [],
  // Called with the set as loaded, before any edit - Modify keeps it to tell
  // which labels a save is ADDING (labelsAdded).
  onLoaded,
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
    onLoaded?.([]);
    fetchJson(url)
      .then((keys) => {
        if (!alive) return;
        onChange(keys);
        onLoaded?.(keys);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
    // onChange is a setState, stable enough; re-running on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // What requires NSFW right now: every held label but NSFW itself.
  const requiringNsfw = [...new Set([...value, ...required])].filter(
    (key) => key !== NSFW,
  );
  const locked = new Set(required);
  if (requiringNsfw.length) locked.add(NSFW);
  const toggle = useCallback(
    (key) => {
      if (locked.has(key)) return;
      const held = new Set(value);
      if (held.has(key)) held.delete(key);
      else held.add(key);
      onChange(withNsfw([...held]));
    },
    // `locked` is derived from value and required.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [value, onChange, required],
  );
  const nameOf = (key) => labels.find((row) => row.key === key)?.label || key;

  function titleFor(row) {
    if (required.includes(row.key)) {
      return "Required: every entry of this type carries it";
    }
    if (row.key === NSFW && locked.has(NSFW)) {
      return `Carried with ${requiringNsfw.map(nameOf).join(", ")}`;
    }
    return row.description || "";
  }

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
            title={titleFor(row)}
          >
            <input
              type="checkbox"
              disabled={disabled || locked.has(row.key)}
              checked={locked.has(row.key) || value.includes(row.key)}
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
  "h-comic",
  "h-game",
  "hentai",
  "collection",
  "franchise",
  "series",
];

// The grouping tiers that carry labels of their own - the picker's group
// owner kinds, and the Add/Modify tabs whose labels cascade.
export const LABELLABLE_GROUPS = Object.freeze(Object.keys(GROUP_LABEL_URL));

// What the picker says under each grouping tier's checkboxes, keyed by tab.
// Kept beside the default so every reading of "what does this hide" sits
// together. Each states the tier's cascade: a collection's label reaches
// every franchise, series and entry in it; a series' reaches its entries.
export const GROUP_SCOPE_NOTES = Object.freeze({
  collection:
    "A labelled collection is hidden from anyone whose active mode does not carry that label - and so is every franchise, series and entry in it.",
  franchise:
    "A labelled franchise is hidden from anyone whose active mode does not carry that label - and so is every series and entry in it.",
  series:
    "A labelled series is hidden from anyone whose active mode does not carry that label - and so is every entry in it.",
});

// What a Modify confirm says an added label hides, keyed by tab; an entry
// tab is not listed and reads "this entry".
export const GROUP_HIDES = Object.freeze({
  collection: "this collection and every franchise, series and entry in it",
  franchise: "this franchise and every series and entry in it",
  series: "this series and every entry in it",
});

// Save an entry's labels. Call after a create returns its system_id, or after
// a modify submit. Failure is reported to the caller rather than swallowed:
// the entry saved, but its visibility did not.
//
// A gated type's required label is always in the set sent: the endpoint
// refuses (422) one that drops it, and the admin cannot uncheck it anyway.
export async function saveEntryLabels(mediaType, entryId, labelKeys) {
  return saveLabels(
    endpoints.contentLabels.forEntry(mediaType, entryId),
    withRequired(labelKeys, requiredLabelsForType(mediaType)),
  );
}

// The same for a franchise. `franchiseType` is the franchise_type the save
// just wrote: an H-Comic franchise carries the h-comic label, a Hentai one
// the hentai label.
export async function saveFranchiseLabels(franchiseId, labelKeys, franchiseType) {
  return saveLabels(
    endpoints.contentLabels.forFranchise(franchiseId),
    withRequired(labelKeys, requiredLabelsForFranchiseType(franchiseType)),
  );
}

// The same for a collection. No gated type stamps a collection, so nothing
// is required beyond the nsfw rule.
export async function saveCollectionLabels(collectionId, labelKeys) {
  return saveLabels(
    endpoints.contentLabels.forCollection(collectionId),
    withNsfw(labelKeys),
  );
}

// The same for a series, which likewise has no required label.
export async function saveSeriesLabels(seriesId, labelKeys) {
  return saveLabels(
    endpoints.contentLabels.forSeries(seriesId),
    withNsfw(labelKeys),
  );
}

// The keys `chosen` holds that `loaded` did not: the labels a save would add.
// Only an added label can newly hide an entry; removing one never narrows.
export function labelsAdded(loaded, chosen) {
  const before = new Set(loaded || []);
  return (chosen || []).filter((key) => !before.has(key));
}

// Whether a label save just hid the entry from this session's own mode. The
// browser is never told which labels a mode carries (/me leaves them out on
// purpose), so the answer comes from reading the entry: a hidden entry
// answers 404, exactly as a missing one does. Any other failure proves
// nothing, so it reads as "not hidden" rather than raising a false alarm.
export async function entryHiddenFromSession(mediaType, entryId) {
  try {
    const res = await fetch(endpoints.resource(mediaType).detail(entryId), {
      credentials: "include",
    });
    return res.status === 404;
  } catch {
    return false;
  }
}

function withRequired(labelKeys, required) {
  return withNsfw([...(labelKeys || []), ...required]);
}

function saveLabels(url, labelKeys) {
  return fetchJson(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label_keys: labelKeys }),
  });
}
