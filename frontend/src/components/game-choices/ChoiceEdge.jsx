// Frontend: one arrow on the choice graph.
//
// Arrows carry no text: a branch's words are on its own pill, and a plain
// link between two blocks is just that. Three kinds are drawn (choiceLayout's
// `arrows`): block to branch, branch to its next block, and block to block.
//
// A forward arrow is a curve from the bottom of one item to the top of the
// next. A return (a back arrow in choiceLayout) is a stepped line out of the
// right side of the later item and into the right side of the earlier block,
// dashed, so a loop reads as "goes back to" instead of as one more branch.
import { BaseEdge, getBezierPath, getSmoothStepPath } from "@xyflow/react";

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
  const [path] = data.isReturn
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
  return <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} interactionWidth={16} />;
}
