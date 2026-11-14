// Frontend: a detail page's save for the viewer's own tracker values.
//
// Status, my rating, progress counters, the paused-at position, usefulness
// and the plan flags are the viewer's own, kept per account under self.list.
// This writes them through useStatusToggle - /api/me/list and
// /api/me/plan-flags - never the catalogue PATCH, so a holder of self.list
// who is not an editor can track what it reads and watches.
//
// The page holds its entry in local state; the save is optimistic over it,
// then replaces it with the answer: the held entry with the saved row folded
// in. /api/me/list keeps the tracker's rule that reaching the total finishes
// the row, so the answered status may differ from the one sent, and the toast
// says Completed when that happened.
//
// Without self.list `saveOwn` does nothing; the page draws no control that
// could call it.
//
// `saveRelease` is the admin toolbar's release step (MarkReleaseButton), the
// one control that edits the work and the viewer's row together: the release
// fields go to the catalogue PATCH, an editor's, and RELEASE_PERSONAL_FIELDS
// (the status move, my watch day) to /api/me - only for a holder of
// self.list, and in the same mutation.
import { useAuth } from "../contexts/AuthContext";
import { RELEASE_PERSONAL_FIELDS } from "../lib/releaseAction";
import { useStatusToggle } from "./useStatusToggle";
import { useToast } from "./useToast";
import { useViewScope } from "./useViewScope";
import { progressToast } from "../lib/progressToast";

export function useOwnTrackerSave(type, { entry, setEntry, setMediaItem, fetchMediaItem }) {
  const { isAdmin } = useAuth();
  const { ownData } = useViewScope();
  const { showToast } = useToast();
  const { mutateAsync } = useStatusToggle(type);

  async function write(optimistic, variables, msg) {
    // `entry` is the pre-write row: the toast compares the answer with it.
    const before = entry;
    setEntry((prev) => ({ ...prev, ...optimistic }));
    try {
      const updated = await mutateAsync({ id: before.system_id, entry: before, ...variables });
      showToast("success", progressToast(before, updated, msg || "Saved"));
      setEntry(updated);
      setMediaItem(updated);
    } catch {
      showToast("error", "Update failed");
      fetchMediaItem();
    }
  }

  async function saveOwn(fields, msg) {
    if (!ownData || !entry) return;
    await write(fields, { fields }, msg);
  }

  async function saveRelease(payload, msg) {
    if (!isAdmin || !entry) return;
    const catalogue = {};
    const fields = {};
    for (const [key, value] of Object.entries(payload)) {
      if (!RELEASE_PERSONAL_FIELDS.has(key)) catalogue[key] = value;
      else if (ownData) fields[key] = value;
    }
    await write({ ...catalogue, ...fields }, { fields, catalogue }, msg);
  }

  return { saveOwn, saveRelease };
}
