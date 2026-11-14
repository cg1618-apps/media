// Frontend: the caller's own favourite quotes and memes.
//
// Whether a quote or a meme is a favourite is kept per account, behind the
// account's `favourites` feature switch, and written through
// PUT /api/me/favorites/{kind}/{id} with `{is_favorite}`; the answer is
// `{kind, item_id, is_favorite}`. Reads carry the viewer's own answer as each
// row's `is_favorite`, so every quote and meme list is invalidated to refetch -
// the Quote and Meme pages and the notes page's sections each read their own.
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { fetchJson, jsonBody } from "../client";
import { endpoints } from "../endpoints";

/** The query keys of every read that shows a quote's or meme's `is_favorite`. */
export const FAVORITE_READ_KEYS = [
  ["quotes-grouped"],
  ["quotes-by-entry"],
  ["memes-grouped"],
  ["memes-by-owner"],
];

/** `{ kind: "quote" | "meme", id, isFavorite }` → the stored answer. */
export function useSetMyFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, id, isFavorite }) =>
      fetchJson(endpoints.me.favorite(kind, id), {
        method: "PUT",
        ...jsonBody({ is_favorite: isFavorite }),
      }),
    onSuccess: () => {
      for (const queryKey of FAVORITE_READ_KEYS)
        queryClient.invalidateQueries({ queryKey });
    },
  });
}
