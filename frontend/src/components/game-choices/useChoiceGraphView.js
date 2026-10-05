// Frontend: everything the card and the modal draw from, in one place.
//
// The graph and the viewer's marks come from the one graph query. The
// viewer's saves come from the page's NotesProvider, which already holds the
// `saves` rows - the graph endpoint deliberately sends none, so the notes
// router stays the one place that decides whose saves a viewer sees. Outside a
// provider there are simply no save badges.
import { useMemo } from "react";

import { useChoiceGraph } from "../../api/mutations/useGameChoiceMutations";
import { useOptionalNotes } from "../../pages/notes/NotesContext";
import { marksByTarget, savesByNode } from "./choiceGraphData";

export function useChoiceGraphView(gameId) {
  const query = useChoiceGraph(gameId);
  const notesContext = useOptionalNotes();
  const notes = notesContext?.notes;
  const graph = query.data;
  const marks = useMemo(() => marksByTarget(graph?.marks || []), [graph]);
  const saves = useMemo(() => savesByNode(notes || []), [notes]);
  return {
    query,
    graph,
    marks,
    saves,
    reloadNotes: notesContext?.reloadNotes,
  };
}
