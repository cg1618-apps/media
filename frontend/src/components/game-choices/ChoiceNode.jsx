// Frontend: one point on the choice graph.
//
// Fixed-size, like RelationNode, because the layout's pitch is computed from
// CHOICE_NODE_WIDTH and CHOICE_NODE_HEIGHT; the two numbers are applied
// inline so they cannot drift from the layout's.
//
// Every kind is drawn as the same plain block holding only its title: the
// graph is blocks and arrows. Kind lives in the side panel and the card's
// endings count, not on the canvas.
//
// Four handles. Top in and bottom out carry the forward options. The two on
// the right carry only return arrows (the layout's back edges), which leave
// and re-enter at the side so a loop is drawn around the graph rather than
// back up through it; they are never offered for a drag. As in RelationNode,
// handles go invisible rather than unmounting on a read-only canvas, since an
// edge is drawn from its mounted handles.
import { Handle, Position } from "@xyflow/react";

import { CHOICE_NODE_HEIGHT, CHOICE_NODE_WIDTH } from "../../lib/choiceLayout";
import { saveLabel } from "./choiceGraphData";

export const HANDLE_IN = "in";
export const HANDLE_OUT = "out";
export const HANDLE_RETURN_IN = "return-in";
export const HANDLE_RETURN_OUT = "return-out";

export default function ChoiceNode({ data, isConnectable = true }) {
  const { node, saves = [], mark, selected } = data;
  const done = Boolean(mark?.done);
  const hasNote = Boolean(mark?.note);
  const hidden = isConnectable ? "" : " !pointer-events-none !opacity-0";

  return (
    <div
      data-testid={`choice-node-${node.id}`}
      data-done={done ? "true" : "false"}
      style={{ width: CHOICE_NODE_WIDTH, height: CHOICE_NODE_HEIGHT }}
      className={`relative flex items-center justify-center gap-1.5 bg-surface px-3 text-center text-text ${
        done ? "border-2 border-brand" : "border border-border-strong"
      } ${selected ? "ring-2 ring-brand ring-offset-2 ring-offset-surface-2" : ""}`}
    >
      <Handle
        id={HANDLE_IN}
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
        className={`!h-2.5 !w-2.5 !bg-text-faint${hidden}`}
      />
      <Handle
        id={HANDLE_RETURN_IN}
        type="target"
        position={Position.Right}
        isConnectable={false}
        style={{ top: "30%" }}
        className="!pointer-events-none !opacity-0"
      />

      {done ? (
        <i className="fas fa-check shrink-0 text-xs text-brand" title="Done" aria-label="Done"></i>
      ) : null}
      <span className="line-clamp-2 text-xs font-medium leading-tight">{node.title}</span>
      {hasNote ? (
        <i
          className="fas fa-note-sticky shrink-0 text-xs text-text-faint"
          title="You have a note here"
          aria-label="Has my note"
        ></i>
      ) : null}

      {saves.length > 0 ? (
        <span
          data-testid="save-badge"
          title={saves.map(saveLabel).join("\n")}
          aria-label={`Saves here: ${saves.map(saveLabel).join(", ")}`}
          className="absolute -top-2.5 -right-2 inline-flex max-w-[7rem] items-center gap-1 truncate border border-brand bg-surface px-1.5 py-0.5 font-mono text-[9px] leading-none text-brand"
        >
          <i className="fas fa-floppy-disk" aria-hidden="true"></i>
          {saves.map((s) => s.locator || "?").join(" ")}
        </span>
      ) : null}

      <Handle
        id={HANDLE_OUT}
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        className={`!h-2.5 !w-2.5 !bg-brand${hidden}`}
      />
      <Handle
        id={HANDLE_RETURN_OUT}
        type="source"
        position={Position.Right}
        isConnectable={false}
        style={{ top: "70%" }}
        className="!pointer-events-none !opacity-0"
      />
    </div>
  );
}
