// Frontend: shared fixtures for the choice graph's component tests.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { vi } from "vitest";

export const GAME_ID = "11111111-1111-1111-1111-111111111111";

export const node = (id, kind, title, sort_index = 0) => ({
  id,
  game_id: GAME_ID,
  kind,
  title,
  content: null,
  sort_index,
});

export const edge = (id, from, to, option = null, sort_index = 0) => ({
  id,
  game_id: GAME_ID,
  from_node_id: from,
  to_node_id: to,
  option,
  sort_index,
});

// A start, one choice and two endings, one of them marked done by the viewer.
export const GRAPH = {
  nodes: [
    node("n-start", "start", "Prologue"),
    node("n-choice", "choice", "The bridge"),
    node("n-good", "ending", "Good end", 0),
    node("n-bad", "ending", "Bad end", 1),
  ],
  edges: [
    edge("e1", "n-start", "n-choice"),
    edge("e2", "n-choice", "n-good", "Cross it", 0),
    edge("e3", "n-choice", "n-bad", "Turn back", 1),
  ],
  marks: [{ id: "m1", node_id: "n-good", edge_id: null, done: true, note: "Got it" }],
};

export const EMPTY_GRAPH = { nodes: [], edges: [], marks: [] };

/** Answers the graph read with `graph` and every write with `{}`. */
export function stubFetch(graph = GRAPH) {
  const fetchMock = vi.fn(async (url, init = {}) => {
    const body = !init.method || init.method === "GET" ? graph : { id: null };
    return { ok: true, status: 200, json: async () => body };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** React Flow measures with ResizeObserver, which jsdom does not have. */
export function stubFlowDom() {
  class Stub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", Stub);
  vi.stubGlobal("DOMMatrixReadOnly", class {});
}

export function renderWithQuery(ui) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
