// The Resources page: a nested tree everyone reads, and the controls a
// manage.catalog holder edits it with. The move tests assert the exact reorder
// body, because the endpoint rejects anything but the complete child list.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Resources from "./Resources";

const auth = { permissions: [] };
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ has: (p) => auth.permissions.includes(p) }),
}));
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const node = (id, kind, title, content, children = []) => ({
  system_id: id,
  kind,
  title,
  content,
  children,
});

// Tools ─┬ Docs (item, inline link)
//        ├ Nested ── Deep (item)
//        └ Third (item)
// Reading ── bare URL (untitled item)
const TREE = [
  node("g1", "group", "Tools", null, [
    node("i1", "item", "Docs", "Read [the docs](https://example.com/docs) first."),
    node("g2", "group", "Nested", null, [node("i2", "item", "Deep", "deep text")]),
    node("i3", "item", "Third", "third text"),
  ]),
  node("g3", "group", "Reading", null, [
    node("i4", "item", null, "https://bare.example.org"),
  ]),
];

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Resources />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const writes = () =>
  global.fetch.mock.calls.filter(([, opts]) => opts?.method && opts.method !== "GET");

const reorderBodies = () =>
  writes()
    .filter(([url]) => url === "/api/resources/reorder")
    .map(([, opts]) => JSON.parse(opts.body));

// jsdom lays nothing out, so a dnd-kit drag needs boxes to hit. layOut() gives
// every row and group body a rectangle stacked in document order, each body
// tall enough to hold its children - the nesting a browser would produce - and
// drag() presses a grip, moves the pointer into a target and releases it.
const ROW = 40;
const rects = new Map();

function layOut() {
  rects.clear();
  let y = 0;
  const box = (depth, top, height) => ({ top, left: depth * 10, width: 800 - depth * 20, height });
  const walk = (el, depth) => {
    for (const child of el.children) {
      if (child.dataset.testid === "resource-item" || child.tagName === "HEADER") {
        rects.set(child, box(depth, y, ROW));
        y += ROW;
      } else if (child.dataset.testid === "resource-group-body") {
        const top = y;
        walk(child, depth + 1);
        y += ROW; // the body's own strip below its rows, where its Add buttons sit
        rects.set(child, box(depth, top, y - top));
      } else {
        walk(child, depth);
      }
    }
  };
  walk(document.body, 0);
}

function rectOf(el) {
  const r = rects.get(el) ?? { top: 0, left: 0, width: 0, height: 0 };
  return { ...r, x: r.left, y: r.top, right: r.left + r.width, bottom: r.top + r.height };
}

const rowOf = (text) => screen.getByText(text).closest("[data-testid=resource-item]");
const bodyOf = (group) =>
  within(screen.getByRole("region", { name: group })).getAllByTestId("resource-group-body")[0];

// `below` aims at the strip under the target's last row - the box's own space -
// rather than at its middle, where one of its rows may sit.
function drag(grip, target, { below = false } = {}) {
  const from = rectOf(grip.closest("article, header"));
  const to = rectOf(target);
  const start = { clientX: from.left + 5, clientY: from.top + 5 };
  const end = { clientX: to.left + 5, clientY: below ? to.bottom - 5 : to.top + to.height / 2 };
  // dnd-kit listens for the rest of the gesture on the element pressed, as a
  // browser's implicit pointer capture would deliver it.
  fireEvent.pointerDown(grip, { ...start, isPrimary: true, button: 0 });
  fireEvent.pointerMove(grip, { ...start, clientY: start.clientY + 10 });
  fireEvent.pointerMove(grip, end);
  fireEvent.pointerUp(grip, end);
}

// jsdom has no PointerEvent; a MouseEvent carrying isPrimary is what dnd-kit's
// pointer sensor reads.
class FakePointerEvent extends MouseEvent {
  constructor(type, init = {}) {
    super(type, init);
    this.isPrimary = init.isPrimary ?? true;
    this.pointerId = init.pointerId ?? 1;
  }
}

beforeEach(() => {
  auth.permissions = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, opts = {}) => {
      if (!opts.method || opts.method === "GET") {
        return { ok: true, status: 200, json: async () => TREE };
      }
      if (opts.method === "DELETE") return { ok: true, status: 204, json: async () => null };
      return { ok: true, status: 200, json: async () => ({}) };
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

beforeEach(() => {
  rects.clear();
  vi.stubGlobal("PointerEvent", FakePointerEvent);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function () {
    return rectOf(this);
  });
});

afterEach(() => vi.restoreAllMocks());

describe("Resources - reading", () => {
  it("nests groups inside groups, one heading level deeper", async () => {
    renderPage();
    const tools = await screen.findByRole("heading", { level: 2, name: "Tools" });
    expect(screen.getByRole("heading", { level: 2, name: "Reading" })).toBeInTheDocument();
    const nested = screen.getByRole("heading", { level: 3, name: "Nested" });
    const toolsGroup = screen.getByRole("region", { name: "Tools" });
    expect(toolsGroup).toContainElement(nested);
    expect(toolsGroup).toContainElement(tools);
    expect(screen.getByRole("region", { name: "Nested" })).toHaveTextContent("deep text");
  });

  it("keeps the server's order, groups and items interleaved", async () => {
    renderPage();
    await screen.findByText("Docs");
    const order = ["Docs", "Nested", "Third"].map((t) => screen.getByText(t));
    for (let i = 1; i < order.length; i++) {
      expect(
        order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    const tools = screen.getByRole("heading", { name: "Tools" });
    const reading = screen.getByRole("heading", { name: "Reading" });
    expect(tools.compareDocumentPosition(reading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders item bodies as Markdown, links inline and autolinked", async () => {
    renderPage();
    const inline = await screen.findByRole("link", { name: "the docs" });
    expect(inline).toHaveAttribute("href", "https://example.com/docs");
    expect(inline).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: "https://bare.example.org" })).toBeInTheDocument();
  });

  it("collapses a group", async () => {
    renderPage();
    await screen.findByText("Docs");
    const toggle = screen.getByRole("button", { name: /^Tools/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Docs")).not.toBeInTheDocument();
  });

  it("shows no editing controls without manage.catalog", async () => {
    // The mirror of the next test: same tree, same page, only the permission
    // differs - so the absence is the gate's doing.
    renderPage();
    await screen.findByText("Docs");
    expect(screen.queryByRole("button", { name: "Add group" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add item" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Reorder / })).toBeNull();
    expect(screen.queryByRole("combobox", { name: /^Move .* to$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Delete / })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Edit / })).toBeNull();
  });
});

describe("Resources - editing", () => {
  beforeEach(() => {
    auth.permissions = ["manage.catalog"];
  });

  it("shows the editing controls with manage.catalog", async () => {
    renderPage();
    await screen.findByText("Docs");
    expect(screen.getByRole("button", { name: "Add group" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Add item" })).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Reorder Docs" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reorder Tools" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Delete Tools" })).toBeInTheDocument();
    // Reordering is drag-and-drop on the grip; the one-place arrows are gone.
    expect(screen.queryByRole("button", { name: /^Move .* (up|down)$/ })).toBeNull();
  });

  it("moves an item down with the full sibling list", async () => {
    renderPage();
    fireEvent.keyDown(await screen.findByRole("button", { name: "Reorder Docs" }), {
      key: "ArrowDown",
    });
    await waitFor(() =>
      expect(reorderBodies()).toEqual([{ parent_id: "g1", ordered_ids: ["g2", "i1", "i3"] }]),
    );
  });

  it("moves an item up with the full sibling list", async () => {
    renderPage();
    fireEvent.keyDown(await screen.findByRole("button", { name: "Reorder Third" }), {
      key: "ArrowUp",
    });
    await waitFor(() =>
      expect(reorderBodies()).toEqual([{ parent_id: "g1", ordered_ids: ["i1", "i3", "g2"] }]),
    );
  });

  it("moves a top-level group with a null parent", async () => {
    renderPage();
    fireEvent.keyDown(await screen.findByRole("button", { name: "Reorder Reading" }), {
      key: "ArrowUp",
    });
    await waitFor(() =>
      expect(reorderBodies()).toEqual([{ parent_id: null, ordered_ids: ["g3", "g1"] }]),
    );
  });

  it("sends nothing for an arrow key past either end", async () => {
    renderPage();
    fireEvent.keyDown(await screen.findByRole("button", { name: "Reorder Docs" }), {
      key: "ArrowUp",
    });
    fireEvent.keyDown(screen.getByRole("button", { name: "Reorder Reading" }), {
      key: "ArrowDown",
    });
    // The mirror: a key with somewhere to go does send, so the silence above
    // is the ends refusing and not the keys being ignored.
    fireEvent.keyDown(screen.getByRole("button", { name: "Reorder Docs" }), {
      key: "ArrowDown",
    });
    await waitFor(() => expect(reorderBodies()).toHaveLength(1));
    expect(reorderBodies()[0]).toEqual({ parent_id: "g1", ordered_ids: ["g2", "i1", "i3"] });
  });

  it("moves an item into another group from the Move to list", async () => {
    renderPage();
    await userEvent.selectOptions(
      await screen.findByRole("combobox", { name: "Move Docs to" }),
      "g3",
    );
    await waitFor(() =>
      expect(reorderBodies()).toEqual([{ parent_id: "g3", ordered_ids: ["i4", "i1"] }]),
    );
  });

  it("does not offer a group its own descendants in the Move to list", async () => {
    renderPage();
    const select = await screen.findByRole("combobox", { name: "Move Tools to" });
    const values = within(select)
      .getAllByRole("option")
      .map((o) => o.value);
    expect(values).toContain("g3");
    expect(values).not.toContain("g1");
    expect(values).not.toContain("g2");
  });

  it("drags an item onto a row in another group, taking its slot", async () => {
    renderPage();
    await screen.findByText("Docs");
    layOut();
    drag(screen.getByRole("button", { name: "Reorder Docs" }), rowOf("https://bare.example.org"));
    await waitFor(() =>
      expect(reorderBodies()).toEqual([{ parent_id: "g3", ordered_ids: ["i1", "i4"] }]),
    );
  });

  it("drags an item onto a group's body, appending it", async () => {
    renderPage();
    await screen.findByText("Third");
    layOut();
    drag(screen.getByRole("button", { name: "Reorder Third" }), bodyOf("Reading"), {
      below: true,
    });
    await waitFor(() =>
      expect(reorderBodies()).toEqual([{ parent_id: "g3", ordered_ids: ["i4", "i3"] }]),
    );
  });

  it("refuses to drop a group into its own descendant", async () => {
    renderPage();
    await screen.findByText("Deep");
    layOut();
    const tools = screen.getByRole("button", { name: "Reorder Tools" });
    drag(tools, bodyOf("Nested"), { below: true });
    // The mirror: the same drag into a legal target does send.
    drag(tools, bodyOf("Reading"), { below: true });
    await waitFor(() => expect(reorderBodies()).toHaveLength(1));
    expect(reorderBodies()[0]).toEqual({ parent_id: "g3", ordered_ids: ["i4", "g1"] });
  });

  it("confirms a group delete with what it holds, then deletes", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Delete Tools" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("3 items and 1 subgroup");
    expect(writes()).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(writes().map(([url, opts]) => [opts.method, url])).toEqual([
        ["DELETE", "/api/resources/g1"],
      ]),
    );
  });

  it("cancelling the delete sends nothing", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Delete Docs" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(writes()).toHaveLength(0);
  });

  it("adds an item to a group", async () => {
    renderPage();
    await screen.findByText("Docs");
    const reading = screen.getByRole("region", { name: "Reading" });
    await userEvent.click(within(reading).getByRole("button", { name: "Add item" }));
    await userEvent.type(within(reading).getByLabelText("Item content"), "a note");
    await userEvent.click(within(reading).getByRole("button", { name: "Add item" }));
    await waitFor(() => {
      const post = writes().find(([, o]) => o.method === "POST");
      expect(post[0]).toBe("/api/resources");
      expect(JSON.parse(post[1].body)).toEqual({
        kind: "item",
        parent_id: "g3",
        title: null,
        content: "a note",
      });
    });
  });

  it("edits a group's title", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Edit Reading" }));
    const input = screen.getByLabelText("Group title");
    await userEvent.clear(input);
    await userEvent.type(input, "Books");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      const patch = writes().find(([, o]) => o.method === "PATCH");
      expect(patch[0]).toBe("/api/resources/g3");
      expect(JSON.parse(patch[1].body)).toEqual({ title: "Books" });
    });
  });
});
