// Frontend: data hooks for an entry's cast (character/person/role rows).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { endpoints } from "../api/endpoints";
import { fetchJson } from "./queryUtils";
import { castIdentityProblem } from "../lib/castOrder";

export function castingQueryKey(mediaType, entryId) {
  return ["casting", mediaType, String(entryId)];
}

export function useCasting(mediaType, entryId, options = {}) {
  const {
    enabled = true,
    staleTime = 30_000,
    queryOptions = {},
  } = options;

  return useQuery({
    queryKey: castingQueryKey(mediaType, entryId),
    queryFn: () => fetchJson(endpoints.casting.get(mediaType, entryId)),
    staleTime,
    enabled: enabled && !!mediaType && !!entryId,
    ...queryOptions,
  });
}

export function useReplaceCasting() {
  const queryClient = useQueryClient();

  return useMutation({
    // Drops any row with no character_id before it ever reaches the server.
    // CastEditor's emptyRow() starts every new row with character_id: null,
    // and the PUT schema requires it - one unfilled trailing row used to
    // 422 the WHOLE cast after the entry itself had already been saved
    // (Add.jsx/Modify.jsx surface that as "Entry saved, but cast failed to
    // save."). Filtering here, in the one place both callers share, means
    // neither has to remember to do it itself.
    //
    // An identity row (CastEditor's identity_row marker, or any row with an
    // identity_id) with no identity picked would save as a second main row
    // of its character, so the whole cast is refused instead. Add and Modify
    // check castIdentityProblem before the entry is saved; this is the
    // backstop. identity_row itself is form state and is not sent.
    //
    // A row's role is optional: CastEditor's "—" choice (and a new row) holds
    // role "", which is sent as null - "" is not a role. Likewise a seiyuu
    // line nobody filled in is not a voice: only voices naming a person are
    // sent, and a blank voice remark is sent as null.
    mutationFn: ({ mediaType, entryId, cast }) => {
      const problem = castIdentityProblem(cast);
      if (problem) return Promise.reject(new Error(problem));
      return fetchJson(endpoints.casting.replace(mediaType, entryId), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cast: (cast || [])
            .filter((row) => row && row.character_id)
            // identity_name and the display_* pair are read-only: names and
            // the resolved photo are display data, never part of the row.
            .map(({
              identity_name: _identityName,
              identity_row: _identityRow,
              display_photo_file: _displayPhotoFile,
              display_photo_focus: _displayPhotoFocus,
              ...row
            }) => ({
              ...row,
              identity_id: row.identity_id || null,
              role: row.role || null,
              voices: (row.voices || [])
                .filter((voice) => voice && voice.person_id)
                .map((voice) => ({
                  person_id: voice.person_id,
                  remark: voice.remark || null,
                })),
            })),
        }),
      });
    },
    // Returned, so mutateAsync resolves only once the cast has been
    // refetched: Modify reloads the form's rows from it right after a save.
    onSuccess: (data, variables) =>
      queryClient.invalidateQueries({
        queryKey: castingQueryKey(variables.mediaType, variables.entryId),
      }),
  });
}
