// Frontend: the query and mutation hooks for one game's choice graph.
//
// One read - `GET /api/game-choice/graph?game_id=` answers the points, the
// options between them and the viewer's own marks together - and every write
// refetches it, the way useResourceMutations does for the Resources tree. The
// graph is small and the layout is a pure function of the rows, so there is
// no optimistic cache update to keep in step with the server.
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { fetchJson, jsonBody } from "../client";
import { endpoints } from "../endpoints";
import { useApiQuery } from "../../hooks/useApiQuery";

/** The cache key every query and invalidation of one game's graph shares. */
export const choiceGraphQueryKey = (gameId) => ["game-choice-graph", gameId];

/** `{nodes, edges, marks}` for one game; idle until there is a game id. */
export function useChoiceGraph(gameId) {
  return useApiQuery(choiceGraphQueryKey(gameId), endpoints.gameChoice.graph(), {
    params: { game_id: gameId },
    enabled: Boolean(gameId),
  });
}

function useGraphMutation(gameId, mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: choiceGraphQueryKey(gameId) }),
  });
}

/** `{ kind, title, content?, sort_index? }` → the created node. */
export function useCreateChoiceNode(gameId) {
  return useGraphMutation(gameId, (body) =>
    fetchJson(endpoints.gameChoice.createNode(), {
      method: "POST",
      ...jsonBody({ game_id: gameId, ...body }),
    }),
  );
}

/** `{ id, data: { kind?, title?, content?, sort_index? } }` → the node. */
export function usePatchChoiceNode(gameId) {
  return useGraphMutation(gameId, ({ id, data }) =>
    fetchJson(endpoints.gameChoice.patchNode(id), { method: "PATCH", ...jsonBody(data) }),
  );
}

/** `id` → deletes the node; the server drops its edges and clears save links. */
export function useDeleteChoiceNode(gameId) {
  return useGraphMutation(gameId, (id) =>
    fetchJson(endpoints.gameChoice.removeNode(id), { method: "DELETE" }),
  );
}

/** `{ from_node_id, to_node_id, option?, sort_index? }` → the created edge. */
export function useCreateChoiceEdge(gameId) {
  return useGraphMutation(gameId, (body) =>
    fetchJson(endpoints.gameChoice.createEdge(), {
      method: "POST",
      ...jsonBody({ game_id: gameId, ...body }),
    }),
  );
}

/** `{ id, data: { option?, sort_index? } }` → the edge. */
export function usePatchChoiceEdge(gameId) {
  return useGraphMutation(gameId, ({ id, data }) =>
    fetchJson(endpoints.gameChoice.patchEdge(id), { method: "PATCH", ...jsonBody(data) }),
  );
}

/** `id` → deletes the edge. */
export function useDeleteChoiceEdge(gameId) {
  return useGraphMutation(gameId, (id) =>
    fetchJson(endpoints.gameChoice.removeEdge(id), { method: "DELETE" }),
  );
}

/**
 * The viewer's own mark on a node or an edge: `{ target: "node" | "edge", id,
 * done, note }`. An upsert; done false with no note removes the row.
 */
export function useSetChoiceMark(gameId) {
  return useGraphMutation(gameId, ({ target, id, done, note }) =>
    fetchJson(
      target === "edge" ? endpoints.gameChoice.markEdge(id) : endpoints.gameChoice.markNode(id),
      { method: "PUT", ...jsonBody({ done: Boolean(done), note: note || null }) },
    ),
  );
}
