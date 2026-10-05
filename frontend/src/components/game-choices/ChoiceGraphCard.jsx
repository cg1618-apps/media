// Frontend: the choice graph's preview card on the game and h-game pages.
//
// A still picture - fixed height, fitted to view, no pan or zoom, no clicks -
// with the counts and "View all", which opens the whole graph in
// ChoiceGraphModal. Editing and the viewer's own marks happen there; the
// preview only shows them (done points and options, note marks, save badges).
//
// Rendered inside the page's NotesProvider, which is where the save badges
// come from (useChoiceGraphView).
import { useState } from "react";

import { useAuth } from "../../contexts/AuthContext";
import { Button, Slip } from "../ui/primitives";
import ChoiceGraph from "./ChoiceGraph";
import ChoiceGraphModal from "./ChoiceGraphModal";
import { graphCounts } from "./choiceGraphData";
import { useChoiceGraphView } from "./useChoiceGraphView";

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export default function ChoiceGraphCard({ gameId, title }) {
  const { isAdmin, has } = useAuth();
  const canMark = Boolean(has?.("self.personal_notes"));
  const { query, graph, marks, saves } = useChoiceGraphView(gameId);
  // null when shut; otherwise whether it opens on the new-point form.
  const [modal, setModal] = useState(null);

  const counts = graphCounts(graph, marks);
  const empty = query.isSuccess && counts.points === 0;

  const actions =
    query.isSuccess && !empty ? (
      <>
        <span data-testid="choice-counts" className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
          {plural(counts.points, "point", "points")} · {plural(counts.endings, "ending", "endings")}
          {canMark && counts.endings > 0
            ? ` · ${counts.endingsDone} / ${counts.endings} endings done`
            : ""}
        </span>
        <Button size="sm" onClick={() => setModal({ adding: false })}>
          View all
        </Button>
      </>
    ) : null;

  return (
    <Slip title="分歧 Choices" actions={actions}>
      {query.isLoading ? (
        <p className="text-xs text-text-faint">Loading…</p>
      ) : query.isError ? (
        <p className="text-xs text-danger">
          Could not load the choices: {query.error?.message || "request failed"}
        </p>
      ) : empty ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-text-faint">
            No choice points yet. The graph maps the options in this game and where they lead.
          </p>
          {isAdmin ? (
            <Button size="sm" kind="primary" onClick={() => setModal({ adding: true })}>
              Add the first point
            </Button>
          ) : null}
        </div>
      ) : graph ? (
        <div data-testid="choice-preview" className="h-64 border border-border bg-surface-2">
          <ChoiceGraph graph={graph} marks={marks} saves={saves} />
        </div>
      ) : null}

      {modal ? (
        <ChoiceGraphModal
          gameId={gameId}
          title={title}
          isAdmin={isAdmin}
          canMark={canMark}
          startAdding={modal.adding}
          onClose={() => setModal(null)}
        />
      ) : null}
    </Slip>
  );
}
