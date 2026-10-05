// Frontend: one option on the choice graph - an arrow from a point to the
// point it leads to, labelled with the option's text.
//
// A forward option is a curve from the bottom of one point to the top of the
// next. A return (a back edge in choiceLayout) is a stepped line out of the
// right side of the later point and into the right side of the earlier one,
// dashed, so a loop reads as "goes back to" instead of as one more branch.
//
// The label is HTML through EdgeLabelRenderer, as FanEdge's is, so it sits
// above every line and can carry the done check and the note mark. On the
// editable canvas the label is also a click target, since a short arrow is a
// hard thing to hit.
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
} from "@xyflow/react";

export default function ChoiceEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data = {},
}) {
  const { option, isReturn, mark, selected, onSelect } = data;
  const [path, labelX, labelY] = isReturn
    ? getSmoothStepPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
        offset: 36,
      })
    : getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const done = Boolean(mark?.done);
  const hasNote = Boolean(mark?.note);
  const showLabel = Boolean(option) || done || hasNote;

  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} interactionWidth={16} />
      {showLabel ? (
        <EdgeLabelRenderer>
          <div
            data-testid={`choice-edge-label-${id}`}
            data-done={done ? "true" : "false"}
            onClick={onSelect ? () => onSelect(id) : undefined}
            className={`nodrag nopan absolute max-w-[10rem] truncate border bg-surface px-1.5 py-0.5 text-[10px] leading-tight ${
              done ? "border-brand text-text" : "border-border text-text-muted"
            } ${selected ? "ring-2 ring-brand" : ""} ${
              onSelect ? "pointer-events-auto cursor-pointer" : "pointer-events-none"
            }`}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {isReturn ? (
              <i className="fas fa-rotate-left mr-1 text-text-faint" title="Returns" aria-label="Returns"></i>
            ) : null}
            {option || ""}
            {done ? (
              <i className="fas fa-check ml-1 text-brand" title="Done" aria-label="Done"></i>
            ) : null}
            {hasNote ? (
              <i
                className="fas fa-note-sticky ml-1 text-text-faint"
                title="You have a note here"
                aria-label="Has my note"
              ></i>
            ) : null}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
