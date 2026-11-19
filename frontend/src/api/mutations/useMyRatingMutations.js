// Frontend: the caller's own rating and expectation of catalogue rows.
//
// A rating of a collection, franchise, series, character, person, studio or
// publisher, and the expectation of the three tiers, are kept per account and
// written through PUT /api/me/ratings/{owner_type}/{owner_id} under
// self.list. The body is partial - only the keys sent change, null clears -
// and the answer is `{owner_type, owner_id, my_rating, expectation}`. Reads
// carry the same values under each row's own field names (`my_rating`,
// `franchise_expectation`, ...), so `applyMyRating` folds an answer back into
// the row a page holds, and every list that sorts or filters on those fields
// is invalidated to refetch.
//
// A book unit's own rating and remark go through PUT
// /api/me/book-units/{unit_id} the same way.
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { fetchJson, jsonBody } from "../client";
import { endpoints } from "../endpoints";
import { mediaItemQueryKey } from "../../hooks/useMediaItem";
import { useToast } from "../../hooks/useToast";
import { useViewScope } from "../../hooks/useViewScope";

/** The read field that carries each tier's expectation. */
export const EXPECTATION_FIELD = {
  collection: "collection_expectation",
  franchise: "franchise_expectation",
  series: "series_expectation",
};

/** `row` with a saved `{owner_type, my_rating, expectation}` folded in. */
export function applyMyRating(row, saved) {
  if (!row || !saved) return row;
  const next = { ...row, my_rating: saved.my_rating ?? null };
  const field = EXPECTATION_FIELD[saved.owner_type];
  if (field) next[field] = saved.expectation ?? null;
  return next;
}

function invalidateReads(queryClient, ownerType) {
  queryClient.invalidateQueries({ queryKey: ["media-list", ownerType] });
  queryClient.invalidateQueries({ queryKey: ["api", "search"] });
}

/**
 * What a form changed of the viewer's own rating (and a tier's expectation),
 * as the PUT body: only the keys that differ from `loaded`, "" sent as null.
 * `loaded` null is a new record, so only the values chosen are sent.
 */
export function myRatingChanges(ownerType, form, loaded) {
  const data = {};
  if ((form.my_rating || null) !== (loaded?.my_rating || null))
    data.my_rating = form.my_rating || null;
  const field = EXPECTATION_FIELD[ownerType];
  if (field && (form[field] || null) !== (loaded?.[field] || null))
    data.expectation = form[field] || null;
  return data;
}

/**
 * `save(ownerType, ownerId, form, loaded, noun)` for a form's Save: once the
 * record itself has saved, PUTs what the form changed of the viewer's rating
 * (myRatingChanges). Answers the saved `{my_rating, expectation}`, or null
 * when nothing was sent, the viewer keeps no list (self.list), or the PUT
 * failed - in which case the record still saved, and the toast says so.
 */
export function useFormRatingSaver() {
  const { ownData } = useViewScope();
  const { mutateAsync } = useSaveMyRating();
  const { showToast } = useToast();
  return async function save(ownerType, ownerId, form, loaded, noun) {
    const data = myRatingChanges(ownerType, form, loaded);
    if (!ownData || Object.keys(data).length === 0) return null;
    try {
      return await mutateAsync({ ownerType, ownerId, data });
    } catch {
      showToast("error", `${noun} saved, but your rating did not save.`);
      return null;
    }
  };
}

/** `{ ownerType, ownerId, data: { my_rating?, expectation? } }` → the saved values. */
export function useSaveMyRating() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ownerType, ownerId, data }) =>
      fetchJson(endpoints.me.rating(ownerType, ownerId), {
        method: "PUT",
        ...jsonBody(data),
      }),
    onSuccess: (_saved, { ownerType }) => invalidateReads(queryClient, ownerType),
  });
}

/**
 * `save(data, message)` for one row: sends the partial body, folds the answer
 * into the page's row through `setRow`, and toasts the outcome.
 */
export function useMyRatingSaver(ownerType, ownerId, setRow) {
  const { mutateAsync } = useSaveMyRating();
  const { showToast } = useToast();
  return async function save(data, message) {
    try {
      const saved = await mutateAsync({ ownerType, ownerId, data });
      setRow((row) => applyMyRating(row, saved));
      showToast("success", message || "Saved");
    } catch (err) {
      showToast("error", err.message || "Save failed");
    }
  };
}

/** `{ unitId, data: { my_rating?, remark? } }` → the saved values. */
export function useSaveMyBookUnit(bookId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ unitId, data }) =>
      fetchJson(endpoints.me.bookUnit(unitId), {
        method: "PUT",
        ...jsonBody(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-list", "book"] });
      if (bookId)
        queryClient.invalidateQueries({ queryKey: mediaItemQueryKey("book", bookId) });
    },
  });
}
