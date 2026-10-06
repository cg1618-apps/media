// Frontend: shared fixtures for the choice graph's component tests.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { vi } from "vitest";

export const GAME_ID = "11111111-1111-1111-1111-111111111111";

/** A block. */
export const node = (id, kind, title, sort_index = 0, content = null) => ({
  id,
  game_id: GAME_ID,
  kind,
  title,
  content,
  sort_index,
});

/** A branch (`choice` or `condition`); `to` null is one with no next part yet. */
export const branch = (id, kind, from, to, title, sort_index = 0, content = null) => ({
  id,
  game_id: GAME_ID,
  kind,
  from_node_id: from,
  to_node_id: to,
  title,
  content,
  sort_index,
});

/** A plain link from one block straight to another. */
export const link = (id, from, to, sort_index = 0) => ({
  id,
  game_id: GAME_ID,
  kind: "link",
  from_node_id: from,
  to_node_id: to,
  title: null,
  content: null,
  sort_index,
});

// A start linked to the bridge; out of the bridge two choices, each to an
// ending (one marked done by the viewer), and a condition that leads nowhere
// yet.
export const GRAPH = {
  nodes: [
    node("n-start", "start", "Prologue"),
    node("n-bridge", "part", "The bridge", 1, "A troll guards it."),
    node("n-good", "ending", "Good end", 2),
    node("n-bad", "ending", "Bad end", 3),
  ],
  edges: [
    link("l-start", "n-start", "n-bridge"),
    branch("b-cross", "choice", "n-bridge", "n-good", "Cross it", 0),
    branch("b-back", "choice", "n-bridge", "n-bad", "Turn back", 1),
    branch("b-luck", "condition", "n-bridge", null, "Luck ≥ 5", 2, "Rolled at the gate"),
  ],
  marks: [{ id: "m1", node_id: "n-good", edge_id: null, done: true, note: "Got it" }],
};

export const EMPTY_GRAPH = { nodes: [], edges: [], marks: [] };

/** Answers the graph read with `graph` and every write with `writeBody`. */
export function stubFetch(graph = GRAPH, writeBody = { id: null }) {
  const fetchMock = vi.fn(async (url, init = {}) => {
    const body = !init.method || init.method === "GET" ? graph : writeBody;
    return { ok: true, status: 200, json: async () => body };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The first call matching `method` and `url`, with its JSON body parsed. */
export function findCall(fetchMock, method, url) {
  const call = fetchMock.mock.calls.find(([u, init]) => u === url && init?.method === method);
  return call ? { url: call[0], body: call[1].body ? JSON.parse(call[1].body) : undefined } : null;
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
