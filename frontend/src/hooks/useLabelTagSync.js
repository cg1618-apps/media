// Frontend: keep the Add and Modify forms' 標籤 Label field and their
// ContentLabelPicker selection in step, live (lib/labelTags.js has the rule).
//
// The page holds the labels once and a form per type, so it hands this hook
// both: `forms` maps each Label-field type to its [form, setForm] pair, and
// `mediaType` names the open one. What comes back is wired into the page:
//
//   editLabels(next)          the picker's `onEdit` - an admin's tick, which
//                             also adds or removes the tag
//   syncUpdater(type, update) wraps a tab's `(key, value)` updater so a
//                             Label-field change also ticks or unticks the
//                             label, and refuses to drop a held NSFW
//
// A load is not an edit: the picker's `onChange` (the set as read) and the
// credits merge (the tags as read) both arrive as the server stored them,
// already in step, and go straight into state.
//
// A form whose Label field is `undefined` has not loaded its tags (Modify's
// loadCreditsIntoForm leaves them out on failure, so a save cannot wipe what
// it never saw). A tick leaves that field alone; the label write syncs the
// stored tags server-side.
//
// `reconcileOnChange` (Add) brings the labels to the open form's tags
// whenever those change other than by an edit - a tab switch, a reset after
// a create - so the picker always shows what the open form will save.
import { useEffect } from "react";

import {
  LABEL_FIELD,
  applyLabelEdit,
  applyTagEdit,
  hasLabelField,
  joinTags,
  nsfwTagRefusal,
  splitTags,
} from "../lib/labelTags";

function sameKeys(a, b) {
  return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

export default function useLabelTagSync({
  mediaType,
  forms,
  labels,
  setLabels,
  onRefused,
  reconcileOnChange = false,
}) {
  const open = hasLabelField(mediaType) ? forms[mediaType] : null;
  const openTags = open ? open[0][LABEL_FIELD] : undefined;

  function editLabels(next) {
    if (!open || open[0][LABEL_FIELD] === undefined) {
      setLabels(next);
      return;
    }
    const synced = applyLabelEdit(splitTags(open[0][LABEL_FIELD]), next);
    setLabels(synced.labels);
    open[1]((p) => ({ ...p, [LABEL_FIELD]: joinTags(synced.tags) }));
  }

  function syncUpdater(type, update) {
    if (!hasLabelField(type)) return update;
    return (key, value) => {
      if (key !== LABEL_FIELD) return update(key, value);
      const synced = applyTagEdit(
        labels,
        splitTags(forms[type][0][LABEL_FIELD]),
        splitTags(value),
      );
      if (synced.refused) onRefused?.(nsfwTagRefusal(labels));
      if (!sameKeys(synced.labels, labels)) setLabels(synced.labels);
      return update(key, joinTags(synced.tags));
    };
  }

  useEffect(() => {
    if (!reconcileOnChange || !open || openTags === undefined) return;
    const tags = splitTags(openTags);
    const synced = applyTagEdit(labels, tags, tags);
    if (!sameKeys(synced.labels, labels)) setLabels(synced.labels);
    if (joinTags(synced.tags) !== joinTags(tags)) {
      open[1]((p) => ({ ...p, [LABEL_FIELD]: joinTags(synced.tags) }));
    }
    // Only a change of open form or of its tags reconciles; an edit has
    // already brought the labels in step, and re-running on `labels` would
    // let a picker tick be undone by the tags it has not yet reached.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reconcileOnChange, mediaType, openTags]);

  return { editLabels, syncUpdater };
}
