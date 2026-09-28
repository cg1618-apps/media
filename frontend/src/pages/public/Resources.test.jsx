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
    expect(screen.queryByRole("button", { name: /^Move .* up$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Delete / })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Edit / })).toBeNull();
    expect(screen.getAllByTestId("resource-item")[0]).not.toHaveAttribute("draggable", "true");
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
    expect(screen.getByRole("button", { name: "Move Docs up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete Tools" })).toBeInTheDocument();
    expect(screen.getAllByTestId("resource-item")[0]).toHaveAttribute("draggable", "true");
  });

  it("moves an item down with the full sibling list", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Move Docs down" }));
    await waitFor(() =>
      expect(reorderBodies()).toEqual([{ parent_id: "g1", ordered_ids: ["g2", "i1", "i3"] }]),
    );
  });

  it("moves an item up with the full sibling list", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Move Third up" }));
    await waitFor(() =>
      expect(reorderBodies()).toEqual([{ parent_id: "g1", ordered_ids: ["i1", "i3", "g2"] }]),
    );
  });

  it("moves a top-level group with a null parent", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Move Reading up" }));
    await waitFor(() =>
      expect(reorderBodies()).toEqual([{ parent_id: null, ordered_ids: ["g3", "g1"] }]),
    );
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
    const [docs, , , bare] = screen.getAllByTestId("resource-item");
    fireEvent.dragStart(docs);
    fireEvent.dragOver(bare);
    fireEvent.drop(bare);
    await waitFor(() =>
      expect(reorderBodies()).toEqual([{ parent_id: "g3", ordered_ids: ["i1", "i4"] }]),
    );
  });

  it("drags an item onto a group's body, appending it", async () => {
    renderPage();
    await screen.findByText("Third");
    const third = screen.getAllByTestId("resource-item")[2];
    const body = within(screen.getByRole("region", { name: "Reading" })).getAllByTestId(
      "resource-group-body",
    )[0];
    fireEvent.dragStart(third);
    fireEvent.dragOver(body);
    fireEvent.drop(body);
    await waitFor(() =>
      expect(reorderBodies()).toEqual([{ parent_id: "g3", ordered_ids: ["i4", "i3"] }]),
    );
  });

  it("refuses to drop a group into its own descendant", async () => {
    renderPage();
    await screen.findByText("Deep");
    const toolsHeader = screen.getByRole("heading", { name: "Tools" }).closest("header");
    const nestedBody = within(screen.getByRole("region", { name: "Nested" })).getAllByTestId(
      "resource-group-body",
    )[0];
    fireEvent.dragStart(toolsHeader);
    fireEvent.dragOver(nestedBody);
    fireEvent.drop(nestedBody);
    // The mirror: the same drag into a legal target does send.
    const readingBody = within(screen.getByRole("region", { name: "Reading" })).getAllByTestId(
      "resource-group-body",
    )[0];
    fireEvent.dragStart(toolsHeader);
    fireEvent.drop(readingBody);
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
