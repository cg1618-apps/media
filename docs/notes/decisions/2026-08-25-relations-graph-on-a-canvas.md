# The relations graph is a canvas, laid out on every read

The relations page draws its graph with `@xyflow/react` from a dedicated
`/graph` endpoint, and layout is computed by pure functions on every render.

- **Rejected: persisted node positions.** A stored position goes stale the
  moment a relation is added, and the layout is cheap to recompute; positions
  are instead kept stable by the layout itself.
- **Rejected: Cytoscape and hand-rolled SVG rendering.** React Flow gives
  panning, zooming and React-rendered nodes for free.
- **Rejected: a second tab or a full-bleed overlay** for the graph; it replaces
  the text list in place.
