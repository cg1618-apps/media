// Frontend: one branch - a choice or a condition - on the choice graph.
//
// Drawn so it can never be mistaken for a block: a rounded pill on an accent
// tint, in smaller type, led by an icon that says which kind it is - a branch
// icon for a choice (the player picks), a question icon for a condition (the
// game decides). It hangs under the block it leaves, and an arrow leaves its
// bottom for the next block when it has one.
//
// Sized like a block, by choiceLayout's sizeOf (BRANCH): a title-only pill is
// compact and fully round; one with a shared description is wider, carries a
// two-line excerpt, and rounds only its corners so the excerpt has room.
//
// Handles: top in (never offered for a drag - a branch hangs out of exactly
// one block), bottom out (dragged onto a block to set the next part), and a
// return handle on the right for a next part that loops back up the story.
// On the editable canvas, a branch with no next part also offers a small
// "+ next part" button.
import { Handle, Position } from "@xyflow/react";

import { BRANCH } from "../../lib/choiceLayout";
import { branchKind } from "./choiceGraphData";
import { HANDLE_IN, HANDLE_OUT, HANDLE_RETURN_OUT } from "./ChoiceNode";

export default function ChoiceBranch({ data, isConnectable = true }) {
  const { edge, mark, selected, size, onAddNext } = data;
  const kind = branchKind(edge.kind);
  const done = Boolean(mark?.done);
  const note = (mark?.note || "").trim();
  const content = (edge.content || "").trim();
  const plain = !content && !note;
  const dangling = !edge.to_node_id;
  const hidden = isConnectable ? "" : " !pointer-events-none !opacity-0";

  return (
    <div
      data-testid={`choice-branch-${edge.id}`}
      data-kind={edge.kind}
      data-done={done ? "true" : "false"}
      style={{
        width: size?.width,
        height: size?.height,
        padding: `${BRANCH.PAD_Y}px ${BRANCH.PAD_X}px`,
      }}
      className={`relative flex border bg-brand-soft text-text ${
        plain ? "rounded-full" : "rounded-[12px]"
      } ${done ? "border-brand ring-1 ring-brand" : "border-brand/40"} ${
        selected ? "ring-2 ring-brand ring-offset-2 ring-offset-surface-2" : ""
      }`}
    >
      <Handle
        id={HANDLE_IN}
        type="target"
        position={Position.Top}
        isConnectable={false}
        className="!pointer-events-none !opacity-0"
      />

      <div
        className={`flex min-h-0 w-full flex-col justify-center overflow-hidden ${
          plain ? "items-center text-center" : "items-stretch text-left"
        }`}
      >
        <div className={`flex min-w-0 items-start gap-1 ${plain ? "justify-center" : ""}`}>
          <i
            data-testid="branch-icon"
            className={`fas ${kind.icon} mt-[2px] w-3 shrink-0 text-[10px] text-brand`}
            title={kind.label}
            aria-label={kind.label}
          ></i>
          <span className="line-clamp-2 min-w-0 text-[11px] leading-[14px]">{edge.title}</span>
          {done ? (
            <i className="fas fa-check mt-[2px] shrink-0 text-[10px] text-brand" title="Done" aria-label="Done"></i>
          ) : null}
        </div>
        {content ? (
          <p className="mt-0.5 line-clamp-2 text-[10px] leading-[13px] text-text-muted">{content}</p>
        ) : null}
        {note ? (
          <p className="mt-0.5 flex min-w-0 items-center gap-1 text-[10px] leading-[13px] text-text-faint">
            <i className="fas fa-note-sticky shrink-0" title="My note" aria-label="Has my note"></i>
            <span className="truncate">{note}</span>
          </p>
        ) : null}
      </div>

      {dangling && onAddNext ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAddNext(edge.id);
          }}
          className="nodrag nopan absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap border border-dashed border-brand/60 bg-surface px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-brand hover:bg-brand-soft"
        >
          + next part
        </button>
      ) : null}

      <Handle
        id={HANDLE_OUT}
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        className={`!h-2 !w-2 !bg-brand${hidden}`}
      />
      <Handle
        id={HANDLE_RETURN_OUT}
        type="source"
        position={Position.Right}
        isConnectable={false}
        className="!pointer-events-none !opacity-0"
      />
    </div>
  );
}
