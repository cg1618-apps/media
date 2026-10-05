// Frontend: a game's choice graph on a React Flow canvas.
//
// Drawing only. The rows come in (`graph`, the viewer's `marks` and the
// viewer's `saves` by node), positions and sizes come from choiceLayout, and
// every gesture goes back out through a callback - the card renders this
// read-only and still, the modal renders it pannable and, for an admin,
// connectable.
//
// Two kinds of React Flow node: a block (ChoiceNode) per story part, and a
// branch pill (ChoiceBranch) per choice or condition. A branch is a node here
// although it is an edge row, because it is laid out and clicked like one; its
// flow id is prefixed (`branch:`) so it can never collide with a block's.
//
// Nothing is dragged: positions are not stored, so a hand-placed item would
// jump back on the next refetch. The layout is the graph's own statement of
// its shape.
import { useEffect, useMemo } from "react";
import {
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useThemeOrLight } from "../../contexts/ThemeContext";
import { choiceLayout } from "../../lib/choiceLayout";
import { tokenColor } from "../relations/RelationGraph";
import ChoiceBranch from "./ChoiceBranch";
import ChoiceEdge from "./ChoiceEdge";
import ChoiceNode, {
  HANDLE_IN,
  HANDLE_OUT,
  HANDLE_RETURN_IN,
  HANDLE_RETURN_OUT,
} from "./ChoiceNode";

const nodeTypes = { block: ChoiceNode, branch: ChoiceBranch };
const edgeTypes = { choice: ChoiceEdge };

const NO_MARKS = { nodes: new Map(), edges: new Map() };
const NO_SAVES = new Map();

const BRANCH_PREFIX = "branch:";

/** The React Flow node id of a block (`{type: "node"}`) or a branch (`{type: "edge"}`). */
export const flowIdOf = (target) =>
  target.type === "edge" ? `${BRANCH_PREFIX}${target.id}` : target.id;

/** What a React Flow node id names: `{type: "node" | "edge", id}`. */
export const targetOfFlowId = (flowId) =>
  flowId.startsWith(BRANCH_PREFIX)
    ? { type: "edge", id: flowId.slice(BRANCH_PREFIX.length) }
    : { type: "node", id: flowId };

const isSelected = (selected, type, id) => selected?.type === type && selected.id === id;

export function toFlow({ graph, marks = NO_MARKS, saves = NO_SAVES, selected, onAddNext }) {
  const nodes = graph?.nodes || [];
  const edges = graph?.edges || [];
  const layout = choiceLayout(nodes, edges, marks);
  const edgeById = new Map(edges.map((e) => [e.id, e]));
  const position = (p) => ({ x: p.x, y: p.y });
  const size = (p) => ({ width: p.width, height: p.height });

  const flowNodes = [
    ...nodes.map((node) => {
      const p = layout.blocks[node.id];
      return {
        id: node.id,
        type: "block",
        position: position(p),
        width: p.width,
        height: p.height,
        data: {
          node,
          saves: saves.get(node.id) || [],
          mark: marks.nodes.get(node.id),
          selected: isSelected(selected, "node", node.id),
          size: size(p),
        },
      };
    }),
    ...Object.entries(layout.branches).map(([id, p]) => {
      const edge = edgeById.get(id);
      return {
        id: flowIdOf({ type: "edge", id }),
        type: "branch",
        position: position(p),
        width: p.width,
        height: p.height,
        data: {
          edge,
          mark: marks.edges.get(id),
          selected: isSelected(selected, "edge", id),
          size: size(p),
          onAddNext,
        },
      };
    }),
  ];

  const muted = tokenColor("--c-text-muted");
  const brand = tokenColor("--c-brand");
  const flowEdges = layout.arrows.map((a) => {
    // An arrow into or out of a done branch is done with it; a link is never
    // marked on its own.
    const done = a.kind !== "link" && Boolean(marks.edges.get(a.edgeId)?.done);
    const stroke = done ? brand : muted;
    return {
      id: a.id,
      type: "choice",
      source: flowIdOf({ type: a.from.type === "branch" ? "edge" : "node", id: a.from.id }),
      target: flowIdOf({ type: a.to.type === "branch" ? "edge" : "node", id: a.to.id }),
      sourceHandle: a.isReturn ? HANDLE_RETURN_OUT : HANDLE_OUT,
      targetHandle: a.isReturn ? HANDLE_RETURN_IN : HANDLE_IN,
      markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
      // Done is told by weight and the accent; a return by its dash.
      style: {
        stroke,
        strokeWidth: done ? 2.5 : 1.5,
        strokeDasharray: a.isReturn ? "6 4" : undefined,
      },
      data: { kind: a.kind, edgeId: a.edgeId, isReturn: a.isReturn },
    };
  });

  return { nodes: flowNodes, edges: flowEdges };
}

/**
 * What a drag from one handle to another means, or null when it means
 * nothing. From a block's bottom handle onto another block: a link. From a
 * branch's bottom handle onto any block (its own included, a loop): that
 * block becomes the branch's next part. Never onto a branch.
 */
export function connectionIntent(c) {
  if (c.sourceHandle !== HANDLE_OUT || c.targetHandle !== HANDLE_IN) return null;
  const from = targetOfFlowId(c.source);
  const to = targetOfFlowId(c.target);
  if (to.type !== "node") return null;
  if (from.type === "edge") return { type: "next", edgeId: from.id, to: to.id };
  if (from.id === to.id) return null;
  return { type: "link", from: from.id, to: to.id };
}

function Canvas({
  graph,
  marks,
  saves,
  interactive = false,
  editable = false,
  selected = null,
  focus = null,
  onSelect,
  onConnect,
  onAddNext,
  onPaneClick,
}) {
  const theme = useThemeOrLight();
  const { setCenter, getZoom } = useReactFlow();
  const { nodes, edges } = useMemo(
    () =>
      toFlow({
        graph,
        marks,
        saves,
        selected,
        onAddNext: interactive && editable ? onAddNext : undefined,
      }),
    [graph, marks, saves, selected, interactive, editable, onAddNext],
  );

  // "Show in graph": centre the canvas on the asked-for item. `focus` carries
  // a nonce, so asking for the same item twice centres it twice.
  useEffect(() => {
    if (!focus) return;
    const target = nodes.find((n) => n.id === flowIdOf(focus));
    if (!target) return;
    setCenter(target.position.x + target.width / 2, target.position.y + target.height / 2, {
      zoom: Math.max(getZoom(), 1),
      duration: 300,
    });
    // Only a new request moves the canvas, not a refetch of the same graph.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  // The still preview answers nothing; everything below is the modal's.
  const still = !interactive;
  return (
    <ReactFlow
      // Re-mounted when the graph's size changes, so the preview fits again.
      key={still ? `${nodes.length}:${edges.length}` : "canvas"}
      colorMode={theme}
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodesDraggable={false}
      nodesConnectable={editable}
      elementsSelectable={interactive}
      isValidConnection={(c) => connectionIntent(c) !== null}
      onConnect={
        editable && onConnect
          ? (c) => {
              const intent = connectionIntent(c);
              if (intent) onConnect(intent);
            }
          : undefined
      }
      onNodeClick={interactive && onSelect ? (_e, n) => onSelect(targetOfFlowId(n.id)) : undefined}
      onEdgeClick={
        interactive && onSelect
          ? (_e, e) => onSelect({ type: "edge", id: e.data.edgeId })
          : undefined
      }
      onPaneClick={interactive ? onPaneClick : undefined}
      panOnDrag={interactive}
      zoomOnScroll={interactive}
      zoomOnPinch={interactive}
      zoomOnDoubleClick={interactive}
      preventScrolling={interactive}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.1}
      proOptions={{ hideAttribution: false }}
    >
      {interactive ? <Controls showInteractive={false} /> : null}
      {interactive ? <MiniMap pannable zoomable /> : null}
    </ReactFlow>
  );
}

// React Flow's hooks need a provider per canvas: the card's preview and the
// modal's canvas are two separate graphs on one page.
export default function ChoiceGraph(props) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
