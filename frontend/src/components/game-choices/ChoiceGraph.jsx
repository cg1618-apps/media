// Frontend: a game's choice graph on a React Flow canvas.
//
// Drawing only. The rows come in (`graph`, the viewer's `marks` and the
// viewer's `saves` by node), positions come from choiceLayout, and every
// gesture goes back out through a callback - the card renders this read-only
// and still, the modal renders it pannable and, for an admin, connectable.
//
// Nothing is dragged: positions are not stored, so a hand-placed point would
// jump back on the next refetch. The layout is the graph's own statement of
// its shape.
import { useMemo } from "react";
import {
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useThemeOrLight } from "../../contexts/ThemeContext";
import { choiceLayout } from "../../lib/choiceLayout";
import { tokenColor } from "../relations/RelationGraph";
import ChoiceEdge from "./ChoiceEdge";
import ChoiceNode, {
  HANDLE_IN,
  HANDLE_OUT,
  HANDLE_RETURN_IN,
  HANDLE_RETURN_OUT,
} from "./ChoiceNode";

const nodeTypes = { choice: ChoiceNode };
const edgeTypes = { choice: ChoiceEdge };

const NO_MARKS = { nodes: new Map(), edges: new Map() };
const NO_SAVES = new Map();

export function toFlow({ graph, marks = NO_MARKS, saves = NO_SAVES, selected, onSelectEdge }) {
  const nodes = graph?.nodes || [];
  const edges = graph?.edges || [];
  const { positions, backEdges } = choiceLayout(nodes, edges);
  const known = new Set(nodes.map((n) => n.id));

  const flowNodes = nodes.map((node) => ({
    id: node.id,
    type: "choice",
    position: positions[node.id],
    data: {
      node,
      saves: saves.get(node.id) || [],
      mark: marks.nodes.get(node.id),
      selected: selected?.type === "node" && selected.id === node.id,
    },
  }));

  const muted = tokenColor("--c-text-muted");
  const brand = tokenColor("--c-brand");
  const flowEdges = edges
    .filter((e) => known.has(e.from_node_id) && known.has(e.to_node_id))
    .map((e) => {
      const isReturn = backEdges.has(e.id);
      const mark = marks.edges.get(e.id);
      const done = Boolean(mark?.done);
      const stroke = done ? brand : muted;
      return {
        id: e.id,
        type: "choice",
        source: e.from_node_id,
        target: e.to_node_id,
        sourceHandle: isReturn ? HANDLE_RETURN_OUT : HANDLE_OUT,
        targetHandle: isReturn ? HANDLE_RETURN_IN : HANDLE_IN,
        markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
        // Done is told by weight and the accent; a return by its dash.
        style: {
          stroke,
          strokeWidth: done ? 2.5 : 1.5,
          strokeDasharray: isReturn ? "6 4" : undefined,
        },
        data: {
          option: e.option,
          isReturn,
          mark,
          selected: selected?.type === "edge" && selected.id === e.id,
          onSelect: onSelectEdge,
        },
      };
    });

  return { nodes: flowNodes, edges: flowEdges };
}

function Canvas({
  graph,
  marks,
  saves,
  interactive = false,
  editable = false,
  selected = null,
  onSelectNode,
  onSelectEdge,
  onConnect,
  onPaneClick,
}) {
  const theme = useThemeOrLight();
  const { nodes, edges } = useMemo(
    () => toFlow({ graph, marks, saves, selected, onSelectEdge: interactive ? onSelectEdge : undefined }),
    [graph, marks, saves, selected, interactive, onSelectEdge],
  );

  // A drag must leave a bottom handle and land on a top one, on another point.
  const isValidConnection = (c) =>
    c.source !== c.target && c.sourceHandle === HANDLE_OUT && c.targetHandle === HANDLE_IN;

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
      isValidConnection={isValidConnection}
      onConnect={
        editable && onConnect
          ? (c) => onConnect({ from: c.source, to: c.target })
          : undefined
      }
      onNodeClick={interactive && onSelectNode ? (_e, n) => onSelectNode(n.id) : undefined}
      onEdgeClick={interactive && onSelectEdge ? (_e, e) => onSelectEdge(e.id) : undefined}
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
