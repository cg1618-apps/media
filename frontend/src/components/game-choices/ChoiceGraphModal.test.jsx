// Frontend: the choice graph's popup.
//
// It opens from the card and closes on Escape, giving the page its scroll
// back. Its controls answer to two different permissions, so each is tested
// both ways: the graph's edit controls to manage.catalog (isAdmin), the done
// box and personal note to self.personal_notes (canMark). Each editor action
// is pinned to the endpoint and body it sends. A block's drawer lists the
// viewer's saves sitting on it; those come from the page's notes. The right
// rail lists the starts and endings and finds one in the graph.
import { Profiler } from "react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ChoiceGraphCard from "./ChoiceGraphCard";
import ChoiceGraphModal from "./ChoiceGraphModal";
import { GAME_ID, GRAPH, findCall, renderWithQuery, stubFetch, stubFlowDom } from "./testGraph";

let auth;
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => auth }));

// The page's notes: two saves on the bridge, one on nothing, one other section.
let notesContext;
vi.mock("../../pages/notes/NotesContext", () => ({
  useOptionalNotes: () => notesContext,
}));
const save = (id, locator, title, choiceNode) => ({
  system_id: id,
  section: "saves",
  locator,
  title,
  fields: choiceNode ? { choice_node: choiceNode } : null,
});

beforeEach(() => {
  stubFlowDom();
  auth = { isAdmin: false, has: () => false };
  notesContext = {
    notes: [
      save("s1", "3", "Before the bridge", "n-bridge"),
      save("s2", "Auto 1", null, "n-bridge"),
      save("s3", "7", "Somewhere", null),
      { system_id: "x", section: "todo", fields: { choice_node: "n-bridge" } },
    ],
    reloadNotes: vi.fn(),
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.style.overflow = "";
});

const renderModal = (props = {}) =>
  renderWithQuery(
    <ChoiceGraphModal gameId={GAME_ID} title="A game" onClose={() => {}} {...props} />,
  );

const drawer = () => screen.getByRole("complementary", { name: "Details" });
const rail = () => screen.getByRole("complementary", { name: "Starts and endings" });

/** Opens a block's drawer by clicking it on the canvas. */
const openBlock = async (id) => {
  fireEvent.click(await screen.findByTestId(`choice-node-${id}`));
  return drawer();
};
/** Opens a branch's drawer by clicking its pill on the canvas. */
const openBranch = async (id) => {
  fireEvent.click(await screen.findByTestId(`choice-branch-${id}`));
  return drawer();
};

describe("ChoiceGraphModal", () => {
  it("opens from View all and closes on Escape, giving the scroll back", async () => {
    stubFetch(GRAPH);
    renderWithQuery(<ChoiceGraphCard gameId={GAME_ID} title="A game" />);
    fireEvent.click(await screen.findByRole("button", { name: "View all" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(document.body.style.overflow).toBe("");
  });

  it("draws the branches as pills, not blocks, and badges only blocks with saves", async () => {
    stubFetch(GRAPH);
    renderModal();
    const bridge = await screen.findByTestId("choice-node-n-bridge");
    const badge = within(bridge).getByTestId("save-badge");
    expect(badge).toHaveTextContent("3 Auto 1");
    expect(badge).toHaveAttribute("title", "3 · Before the bridge\nAuto 1");
    // A save on nothing, and a non-save row naming the block, badge nothing.
    expect(within(screen.getByTestId("choice-node-n-start")).queryByTestId("save-badge")).toBeNull();

    expect(screen.getAllByTestId(/^choice-node-/)).toHaveLength(4);
    expect(screen.getAllByTestId(/^choice-branch-/)).toHaveLength(3);
    expect(screen.queryByTestId("choice-node-b-cross")).toBeNull();

    fireEvent.click(bridge);
    expect(within(drawer()).getByText("3 · Before the bridge")).toBeInTheDocument();
    expect(within(drawer()).getByText("Auto 1")).toBeInTheDocument();
  });

  it("opens a branch from its pill or from its block's drawer", async () => {
    stubFetch(GRAPH);
    renderModal();
    let panel = await openBranch("b-luck");
    expect(within(panel).getByText("Condition")).toBeInTheDocument();
    expect(within(panel).getByText("Luck ≥ 5")).toBeInTheDocument();
    expect(within(panel).getByText("Rolled at the gate")).toBeInTheDocument();
    expect(within(panel).getByTestId("branch-next")).toHaveTextContent("No next part yet.");

    panel = await openBlock("n-bridge");
    fireEvent.click(within(panel).getByRole("button", { name: "Cross it → Good end" }));
    expect(within(drawer()).getByTestId("branch-next")).toHaveTextContent("Leads to Good end");
  });

  it("hides every edit control from a viewer who is not an admin", async () => {
    stubFetch(GRAPH);
    renderModal({ isAdmin: false });
    await openBlock("n-bridge");

    for (const name of [
      "Add block",
      "Edit block",
      "Delete block",
      "+ Add choice",
      "+ Add condition",
      "+ Link to block",
    ]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "+ next part" })).not.toBeInTheDocument();

    await openBranch("b-luck");
    for (const name of ["Add next part", "Link to existing block", "Edit condition", "Delete condition"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
  });

  it("gives an admin the edit controls, and the delete asks once more", async () => {
    const fetchMock = stubFetch(GRAPH);
    renderModal({ isAdmin: true });
    expect(screen.getByRole("button", { name: "Add block" })).toBeInTheDocument();
    await openBlock("n-bridge");

    expect(screen.getByRole("button", { name: "Edit block" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete block" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));

    await waitFor(() =>
      expect(findCall(fetchMock, "DELETE", "/api/game-choice/nodes/n-bridge")).toBeTruthy(),
    );
    // The block's saves lost their link server-side; the page re-reads them.
    await waitFor(() => expect(notesContext.reloadNotes).toHaveBeenCalled());
  });

  it("adds a standalone block from the new-block form", async () => {
    const fetchMock = stubFetch(GRAPH);
    renderModal({ isAdmin: true });
    await screen.findByTestId("choice-node-n-bridge");
    fireEvent.click(screen.getByRole("button", { name: "Add block" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "True end" } });
    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "ending" } });
    fireEvent.click(within(drawer()).getByRole("button", { name: "Add block" }));

    await waitFor(() =>
      expect(findCall(fetchMock, "POST", "/api/game-choice/nodes")?.body).toEqual({
        game_id: GAME_ID,
        kind: "ending",
        title: "True end",
        content: null,
        sort_index: 4,
      }),
    );
  });

  it("edits a block's title, kind and description", async () => {
    const fetchMock = stubFetch(GRAPH);
    renderModal({ isAdmin: true });
    await openBlock("n-bridge");
    fireEvent.click(screen.getByRole("button", { name: "Edit block" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "The old bridge" } });
    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "ending" } });
    fireEvent.click(within(drawer()).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(findCall(fetchMock, "PATCH", "/api/game-choice/nodes/n-bridge")?.body).toEqual({
        kind: "ending",
        title: "The old bridge",
        content: "A troll guards it.",
      }),
    );
  });

  it.each([
    ["+ Add choice", "choice", "Add choice"],
    ["+ Add condition", "condition", "Add condition"],
  ])("%s creates a branch of that kind out of the block, with no next part", async (open, kind, submit) => {
    const fetchMock = stubFetch(GRAPH);
    renderModal({ isAdmin: true });
    await openBlock("n-bridge");
    fireEvent.click(screen.getByRole("button", { name: open }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Swim" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Cold water" } });
    fireEvent.click(within(drawer()).getByRole("button", { name: submit }));

    await waitFor(() =>
      expect(findCall(fetchMock, "POST", "/api/game-choice/edges")?.body).toEqual({
        game_id: GAME_ID,
        kind,
        from_node_id: "n-bridge",
        title: "Swim",
        content: "Cold water",
        // After the three branches already out of the bridge.
        sort_index: 3,
      }),
    );
  });

  it("+ Link to block links the block straight to an existing one", async () => {
    const fetchMock = stubFetch(GRAPH);
    renderModal({ isAdmin: true });
    await openBlock("n-start");
    fireEvent.click(screen.getByRole("button", { name: "+ Link to block" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Link to block" }), {
      target: { value: "n-good" },
    });
    fireEvent.click(within(drawer()).getByRole("button", { name: "Add link" }));

    await waitFor(() =>
      expect(findCall(fetchMock, "POST", "/api/game-choice/edges")?.body).toEqual({
        game_id: GAME_ID,
        kind: "link",
        from_node_id: "n-start",
        to_node_id: "n-good",
        sort_index: 1,
      }),
    );
  });

  it("adds a branch's next part through /next, then opens the new block", async () => {
    const created = { node: { id: "n-gate" }, edge: { id: "b-luck" } };
    const fetchMock = stubFetch(GRAPH, created);
    renderModal({ isAdmin: true });
    await openBranch("b-luck");
    fireEvent.click(screen.getByRole("button", { name: "Add next part" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "The gate" } });
    fireEvent.click(within(drawer()).getByRole("button", { name: "Add next part" }));

    await waitFor(() =>
      expect(findCall(fetchMock, "POST", "/api/game-choice/edges/b-luck/next")?.body).toEqual({
        kind: "part",
        title: "The gate",
        content: null,
      }),
    );
  });

  it("opens the next-part form from a dangling pill's + next part", async () => {
    stubFetch(GRAPH);
    renderModal({ isAdmin: true });
    // Only the condition has no next part, so it alone offers one.
    const buttons = await screen.findAllByRole("button", { name: "+ next part" });
    expect(buttons).toHaveLength(1);
    expect(within(screen.getByTestId("choice-branch-b-luck")).getByRole("button")).toBe(buttons[0]);

    fireEvent.click(buttons[0]);
    expect(within(drawer()).getByRole("button", { name: "Add next part" })).toHaveAttribute("type", "submit");
    expect(within(drawer()).getByLabelText("Title")).toBeInTheDocument();
  });

  it("points a branch at an existing block, and clears it again", async () => {
    const fetchMock = stubFetch(GRAPH);
    renderModal({ isAdmin: true });
    await openBranch("b-luck");
    fireEvent.click(screen.getByRole("button", { name: "Link to existing block" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Link to existing block" }), {
      target: { value: "n-bridge" },
    });
    fireEvent.click(within(drawer()).getByRole("button", { name: "Set next part" }));
    await waitFor(() =>
      expect(findCall(fetchMock, "PATCH", "/api/game-choice/edges/b-luck")?.body).toEqual({
        to_node_id: "n-bridge",
      }),
    );

    await openBranch("b-cross");
    expect(screen.queryByRole("button", { name: "Add next part" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear next part" }));
    await waitFor(() =>
      expect(findCall(fetchMock, "PATCH", "/api/game-choice/edges/b-cross")?.body).toEqual({
        to_node_id: null,
      }),
    );
  });

  it("switches a choice to a condition from the branch's edit form", async () => {
    const fetchMock = stubFetch(GRAPH);
    renderModal({ isAdmin: true });
    await openBranch("b-cross");
    fireEvent.click(screen.getByRole("button", { name: "Edit choice" }));
    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "condition" } });
    fireEvent.click(within(drawer()).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(findCall(fetchMock, "PATCH", "/api/game-choice/edges/b-cross")?.body).toEqual({
        kind: "condition",
        title: "Cross it",
        content: null,
      }),
    );
  });

  it("deletes a branch after asking once more", async () => {
    const fetchMock = stubFetch(GRAPH);
    renderModal({ isAdmin: true });
    await openBranch("b-back");
    fireEvent.click(screen.getByRole("button", { name: "Delete choice" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
    await waitFor(() =>
      expect(findCall(fetchMock, "DELETE", "/api/game-choice/edges/b-back")).toBeTruthy(),
    );
  });

  it("marks a block done through its own endpoint, keeping the note", async () => {
    const fetchMock = stubFetch(GRAPH);
    renderModal({ canMark: true });
    await openBlock("n-bad");

    fireEvent.click(screen.getByRole("checkbox", { name: "Done" }));
    await waitFor(() =>
      expect(findCall(fetchMock, "PUT", "/api/game-choice/nodes/n-bad/mark")?.body).toEqual({
        done: true,
        note: null,
      }),
    );
  });

  it("marks a branch through the edge endpoint", async () => {
    const fetchMock = stubFetch(GRAPH);
    renderModal({ canMark: true });
    const panel = await openBranch("b-cross");
    expect(within(panel).queryByRole("button", { name: "Edit choice" })).toBeNull();

    fireEvent.change(within(panel).getByLabelText("My note"), { target: { value: "Safe" } });
    fireEvent.blur(within(panel).getByLabelText("My note"));
    await waitFor(() =>
      expect(findCall(fetchMock, "PUT", "/api/game-choice/edges/b-cross/mark")?.body).toEqual({
        done: false,
        note: "Safe",
      }),
    );
  });

  it("shows the viewer's existing mark: a done block with its note", async () => {
    stubFetch(GRAPH);
    renderModal({ canMark: true });
    await openBlock("n-good");
    expect(screen.getByRole("checkbox", { name: "Done" })).toBeChecked();
    expect(screen.getByLabelText("My note")).toHaveValue("Got it");
  });

  it("offers no done box or note without self.personal_notes, on a block or a branch", async () => {
    stubFetch(GRAPH);
    renderModal({ canMark: false, isAdmin: true });
    await openBlock("n-good");
    expect(screen.queryByRole("checkbox", { name: "Done" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("My note")).not.toBeInTheDocument();
    // The done styling still comes from the marks the graph sent.
    expect(screen.getByTestId("choice-node-n-good")).toHaveAttribute("data-done", "true");

    await openBranch("b-cross");
    expect(screen.queryByRole("checkbox", { name: "Done" })).not.toBeInTheDocument();
  });
});

describe("ChoiceGraphModal right rail", () => {
  it("lists the starts and the endings, with the endings' done checks", async () => {
    stubFetch(GRAPH);
    renderModal({ canMark: true });
    await screen.findByTestId("choice-node-n-good");

    const r = rail();
    expect(within(r).getByRole("button", { name: "Starts (1)" })).toBeInTheDocument();
    expect(within(r).getByRole("button", { name: "Endings (2)" })).toBeInTheDocument();
    expect(within(r).getByTestId("rail-item-n-start")).toHaveTextContent("Prologue");
    expect(within(within(r).getByTestId("rail-item-n-good")).getByLabelText("Done")).toBeInTheDocument();
    expect(within(within(r).getByTestId("rail-item-n-bad")).queryByLabelText("Done")).toBeNull();
    // No part is listed.
    expect(within(r).queryByTestId("rail-item-n-bridge")).toBeNull();
  });

  it("collapses a section", async () => {
    stubFetch(GRAPH);
    renderModal();
    await screen.findByTestId("choice-node-n-good");
    fireEvent.click(within(rail()).getByRole("button", { name: "Endings (2)" }));
    expect(within(rail()).queryByTestId("rail-item-n-good")).toBeNull();
    expect(within(rail()).getByTestId("rail-item-n-start")).toBeInTheDocument();
  });

  it("expands an ending in place, and Show in graph selects it", async () => {
    stubFetch(GRAPH);
    renderModal({ canMark: true });
    await screen.findByTestId("choice-node-n-good");
    const item = within(rail()).getByTestId("rail-item-n-good");
    fireEvent.click(within(item).getByRole("button", { name: /Good end/ }));

    expect(within(item).getByText("No description.")).toBeInTheDocument();
    expect(within(item).getByText("Done")).toBeInTheDocument();
    expect(within(item).getByText("Got it")).toBeInTheDocument();

    fireEvent.click(within(item).getByRole("button", { name: "Show in graph" }));
    const panel = drawer();
    expect(within(panel).getByRole("heading", { name: "Good end" })).toBeInTheDocument();
    // The drawer opens on the left and the rail stays where it was.
    expect(rail()).toBeInTheDocument();
  });

  it("can be hidden from the header", async () => {
    stubFetch(GRAPH);
    renderModal();
    await screen.findByTestId("choice-node-n-good");
    fireEvent.click(screen.getByRole("button", { name: "Starts & endings" }));
    expect(screen.queryByRole("complementary", { name: "Starts and endings" })).toBeNull();
  });
});

describe("ChoiceGraphModal settles", () => {
  // A graph reported to freeze the browser on "View all": a start linked to a
  // part, and a second part nothing connects to. React Flow is given a
  // ResizeObserver that reports, and elements that measure, so the
  // measurement round trip runs as it does in a browser; the popup must then
  // stop rendering rather than loop.
  const FROZE = {
    nodes: [
      { id: "s", game_id: GAME_ID, kind: "start", title: "sta", content: null, sort_index: 0 },
      { id: "c1", game_id: GAME_ID, kind: "part", title: "ch1", content: null, sort_index: 1 },
      { id: "c2", game_id: GAME_ID, kind: "part", title: "ch2", content: null, sort_index: 2 },
    ],
    edges: [
      {
        id: "l",
        game_id: GAME_ID,
        kind: "link",
        from_node_id: "s",
        to_node_id: "c1",
        title: null,
        content: null,
        sort_index: 0,
      },
    ],
    marks: [],
  };

  beforeEach(() => {
    class MeasuringObserver {
      constructor(cb) {
        this.cb = cb;
      }
      observe(el) {
        setTimeout(() => this.cb([{ target: el, contentRect: { width: 800, height: 600 } }], this), 0);
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", MeasuringObserver);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function () {
      return parseFloat(this.style.width) || 800;
    });
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function () {
      return parseFloat(this.style.height) || 600;
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("opens from the card with every control showing, and stops rendering", async () => {
    stubFetch(FROZE);
    auth = { isAdmin: true, has: () => true };
    notesContext = { notes: [], reloadNotes: vi.fn() };
    let commits = 0;
    renderWithQuery(
      <Profiler id="graph" onRender={() => commits++}>
        <ChoiceGraphCard gameId={GAME_ID} title="A game" />
      </Profiler>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "View all" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByTestId("choice-node-c2")).toBeInTheDocument();

    await new Promise((r) => setTimeout(r, 300));
    const settled = commits;
    await new Promise((r) => setTimeout(r, 300));
    expect(commits).toBe(settled);
    expect(commits).toBeLessThan(50);
  });
});
