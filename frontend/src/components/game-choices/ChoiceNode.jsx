// Frontend: one block - a story part - on the choice graph.
//
// A plain rectangle. Its size comes from choiceLayout's sizeOf and is applied
// inline, with the paddings and line heights sizeOf counts (BLOCK), so the
// layout's spacing and the drawing agree. A title-only block is compact; one
// with a shared description shows a two-line excerpt of it; one holding the
// viewer's note shows a one-line excerpt of that, behind a note icon.
//
// Kind is drawn only where it matters to the story's shape: a start carries a
// small play icon and an ending a small flag. A part carries nothing.
//
// Four handles. Top in and bottom out carry the forward arrows - to its
// branches and its links, and from whatever leads here. The two on the right
// carry only return arrows (the layout's back arrows), which leave and
// re-enter at the side so a loop is drawn around the graph rather than back up
// through it; they are never offered for a drag. Handles go invisible rather
// than unmounting on a read-only canvas, since an edge is drawn from its
// mounted handles.
import { Handle, Position } from "@xyflow/react";

import { BLOCK } from "../../lib/choiceLayout";
import { saveLabel } from "./choiceGraphData";

export const HANDLE_IN = "in";
export const HANDLE_OUT = "out";
export const HANDLE_RETURN_IN = "return-in";
export const HANDLE_RETURN_OUT = "return-out";

const KIND_ICON = {
  start: { icon: "fa-play", label: "Start" },
  ending: { icon: "fa-flag", label: "Ending" },
};

export default function ChoiceNode({ data, isConnectable = true }) {
  const { node, saves = [], mark, selected, size } = data;
  const done = Boolean(mark?.done);
  const note = (mark?.note || "").trim();
  const content = (node.content || "").trim();
  const plain = !content && !note;
  const kindIcon = KIND_ICON[node.kind];
  const hidden = isConnectable ? "" : " !pointer-events-none !opacity-0";

  return (
    <div
      data-testid={`choice-node-${node.id}`}
      data-kind={node.kind}
      data-done={done ? "true" : "false"}
      style={{
        width: size?.width,
        height: size?.height,
        padding: `${BLOCK.PAD_Y}px ${BLOCK.PAD_X}px`,
      }}
      className={`relative flex border bg-surface text-text ${done ? "border-brand ring-1 ring-brand" : "border-border-strong"} ${
        selected ? "ring-2 ring-brand ring-offset-2 ring-offset-surface-2" : ""
      }`}
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

      {/* Clipped, should the estimate fall short of the real text. */}
      <div
        className={`flex min-h-0 w-full flex-col justify-center overflow-hidden ${
          plain ? "items-center text-center" : "items-stretch text-left"
        }`}
      >
        <div className={`flex min-w-0 items-start gap-1 ${plain ? "justify-center" : ""}`}>
          {kindIcon ? (
            <i
              className={`fas ${kindIcon.icon} mt-[3px] w-3 shrink-0 text-[10px] text-text-faint`}
              title={kindIcon.label}
              aria-label={kindIcon.label}
            ></i>
          ) : null}
          <span className="line-clamp-2 min-w-0 text-xs font-medium leading-4">{node.title}</span>
          {done ? (
            <i className="fas fa-check mt-[2px] shrink-0 text-xs text-brand" title="Done" aria-label="Done"></i>
          ) : null}
        </div>
        {content ? (
          <p
            data-testid="block-excerpt"
            className="mt-1 line-clamp-2 text-[11px] leading-[14px] text-text-muted"
          >
            {content}
          </p>
        ) : null}
        {note ? (
          <p
            data-testid="block-note"
            className="mt-1 flex min-w-0 items-center gap-1 text-[11px] leading-[14px] text-text-faint"
          >
            <i className="fas fa-note-sticky shrink-0" title="My note" aria-label="Has my note"></i>
            <span className="truncate">{note}</span>
          </p>
        ) : null}
      </div>

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
