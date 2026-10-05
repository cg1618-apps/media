// Frontend: one point on the choice graph.
//
// Fixed-size, like RelationNode, because the layout's pitch is computed from
// CHOICE_NODE_WIDTH and CHOICE_NODE_HEIGHT; the two numbers are applied
// inline so they cannot drift from the layout's.
//
// Kind is told by shape and fill, never by hue (design-system rule 5), and is
// always also written in the node: a start is a pill, a choice a square slip
// with a strong rule, a scene a quiet inset slip, and an ending is inverted to
// ink - the one fill that reads as "this is where it stops" in both themes.
//
// Four handles. Top in and bottom out carry the forward options. The two on
// the right carry only return arrows (the layout's back edges), which leave
// and re-enter at the side so a loop is drawn around the graph rather than
// back up through it; they are never offered for a drag. As in RelationNode,
// handles go invisible rather than unmounting on a read-only canvas, since an
// edge is drawn from its mounted handles.
import { Handle, Position } from "@xyflow/react";

import { CHOICE_NODE_HEIGHT, CHOICE_NODE_WIDTH } from "../../lib/choiceLayout";
import { kindLabel, saveLabel } from "./choiceGraphData";

export const HANDLE_IN = "in";
export const HANDLE_OUT = "out";
export const HANDLE_RETURN_IN = "return-in";
export const HANDLE_RETURN_OUT = "return-out";

const KIND_CLS = {
  start: "rounded-full border-2 border-text bg-surface text-text",
  choice: "border-2 border-border-strong bg-surface text-text",
  scene: "border border-border bg-surface-2 text-text",
  ending: "border-2 border-ink bg-ink text-ink-text",
};

export default function ChoiceNode({ data, isConnectable = true }) {
  const { node, saves = [], mark, selected } = data;
  const done = Boolean(mark?.done);
  const hasNote = Boolean(mark?.note);
  const hidden = isConnectable ? "" : " !pointer-events-none !opacity-0";
  const ending = node.kind === "ending";

  return (
    <div
      data-testid={`choice-node-${node.id}`}
      data-done={done ? "true" : "false"}
      style={{ width: CHOICE_NODE_WIDTH, height: CHOICE_NODE_HEIGHT }}
      className={`relative flex flex-col justify-center px-3 ${KIND_CLS[node.kind] || KIND_CLS.scene} ${
        done ? "!border-brand !border-2" : ""
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

      <span
        className={`font-mono text-[9px] uppercase tracking-[0.14em] ${
          ending ? "text-ink-text/70" : "text-text-faint"
        }`}
      >
        {kindLabel(node.kind)}
        {done ? (
          <i
            className={`fas fa-check ml-1.5 ${ending ? "text-ink-text" : "text-brand"}`}
            title="Done"
            aria-label="Done"
          ></i>
        ) : null}
        {hasNote ? (
          <i
            className="fas fa-note-sticky ml-1.5"
            title="You have a note here"
            aria-label="Has my note"
          ></i>
        ) : null}
      </span>
      <span className="line-clamp-2 text-xs font-medium leading-tight">{node.title}</span>

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
