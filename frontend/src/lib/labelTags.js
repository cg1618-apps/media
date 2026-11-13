// Frontend: a content label and its 標籤 Label tag, kept in step on the Add
// and Modify forms - the browser half of app/services/domain/label_tags.py.
//
// Three labels have a tag: `nsfw` NSFW, `ecchi` 輕微色情, `erotica` 擦邊肉番.
// On an entry of a type with the Label field (LABEL_FIELD_TYPES, the nine
// ungated types), ticking the label adds the tag and adding the tag ticks the
// label; unticking or removing either removes the other. The server does the
// same on every write, so a form kept in step here saves what it shows
// whichever of its two writes runs last.
//
// The nsfw rule runs through both sides, as ContentLabelPicker draws it:
// every other label is held with nsfw, so adding 輕微色情 also adds NSFW, and
// removing the NSFW tag while 輕微色情 or 擦邊肉番 stays is refused - the
// server answers that write 422.
//
// Groups and the gated types have no Label field; nothing here touches them.

// Every other label is stored with nsfw (app/services/domain/label_rules.py).
export const NSFW = "nsfw";

// The form key and category of the Label field (lib/genreLabelFields.js).
export const LABEL_FIELD = "label";

// The types whose forms carry the Label field - the backend's
// TAG_FIELDS["label"].media_types.
export const LABEL_FIELD_TYPES = Object.freeze([
  "anime",
  "anime-movie",
  "movie",
  "tv-show",
  "cartoon",
  "manga",
  "novel",
  "comic",
  "game",
]);

// {label key: tag value}, in the labels' display order - the backend's
// TAG_FOR_LABEL, from CONTENT_LABELS' `tag` (app/services/rbac/labels.py).
export const TAG_FOR_LABEL = Object.freeze({
  nsfw: "NSFW",
  ecchi: "輕微色情",
  erotica: "擦邊肉番",
});

export const LABEL_FOR_TAG = Object.freeze(
  Object.fromEntries(Object.entries(TAG_FOR_LABEL).map(([k, t]) => [t, k])),
);

const LABEL_TAGS = Object.values(TAG_FOR_LABEL);

export function hasLabelField(mediaType) {
  return LABEL_FIELD_TYPES.includes(mediaType);
}

// `keys` plus nsfw when any other label is among them - the server's
// with_required_labels, so what the form shows is what the save stores.
export function withNsfw(keys) {
  const out = new Set(keys || []);
  if ([...out].some((key) => key !== NSFW)) out.add(NSFW);
  return [...out].sort();
}

// A tags field's comma-joined string as trimmed, non-empty names, and back -
// the shape MultiSelect reads and writes.
export function splitTags(raw) {
  return (raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function joinTags(tags) {
  return tags.join(", ");
}

// `tags` with the label tags made to match `labelKeys`: a tag whose label is
// absent is dropped, a missing one is appended. Every other tag keeps its
// place.
export function tagsForLabels(tags, labelKeys) {
  const wanted = new Set(
    (labelKeys || []).filter((k) => k in TAG_FOR_LABEL).map((k) => TAG_FOR_LABEL[k]),
  );
  const out = (tags || []).filter((t) => !LABEL_TAGS.includes(t) || wanted.has(t));
  for (const tag of LABEL_TAGS) {
    if (wanted.has(tag) && !out.includes(tag)) out.push(tag);
  }
  return out;
}

// `labelKeys` with the tagged labels made to match `tags`, sorted. A label
// with no tag is left as it is.
export function labelsForTags(labelKeys, tags) {
  const held = new Set(tags || []);
  const kept = (labelKeys || []).filter((k) => !(k in TAG_FOR_LABEL));
  const implied = Object.keys(TAG_FOR_LABEL).filter((k) =>
    held.has(TAG_FOR_LABEL[k]),
  );
  return [...new Set([...kept, ...implied])].sort();
}

// Whether the NSFW tag is locked: some other label is held, so nsfw is too.
export function nsfwTagLocked(labelKeys) {
  return (labelKeys || []).some((k) => k !== NSFW);
}

// The admin ticked or unticked a label: the labels (nsfw rule applied) and
// the Label field's tags made to match them.
export function applyLabelEdit(tags, labelKeys) {
  const labels = withNsfw(labelKeys);
  return { labels, tags: tagsForLabels(tags, labels) };
}

// The admin changed the Label field from `prevTags` to `nextTags` while
// `labelKeys` were held: the labels and tags to keep. Taking NSFW off while
// another label stays is refused, as the picker refuses unticking it - the
// result is then `prevTags` (brought in step with the labels) and
// `refused: true`.
export function applyTagEdit(labelKeys, prevTags, nextTags) {
  const current = labelKeys || [];
  const requested = labelsForTags(current, nextTags);
  if (
    current.includes(NSFW) &&
    !requested.includes(NSFW) &&
    nsfwTagLocked(requested)
  ) {
    return {
      labels: [...current].sort(),
      tags: tagsForLabels(prevTags, current),
      refused: true,
    };
  }
  const labels = withNsfw(requested);
  return { labels, tags: tagsForLabels(nextTags, labels), refused: false };
}

// What a refused NSFW removal says, naming the tags that hold it.
export function nsfwTagRefusal(labelKeys) {
  const named = (labelKeys || [])
    .filter((k) => k !== NSFW)
    .map((k) => TAG_FOR_LABEL[k] || k);
  return `"${TAG_FOR_LABEL[NSFW]}" is carried with ${named.join(", ")} - remove ${named.length > 1 ? "those" : "that"} first.`;
}
