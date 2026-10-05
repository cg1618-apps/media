// Frontend: the choice graph's popup.
//
// It opens from the card and closes on Escape, giving the page its scroll
// back. Its controls answer to two different permissions, so each is tested
// both ways: the graph's edit controls to manage.catalog (isAdmin), the done
// box and personal note to self.personal_notes (canMark). A point's panel
// lists the viewer's saves sitting on it; those come from the page's notes.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ChoiceGraphCard from "./ChoiceGraphCard";
import ChoiceGraphModal from "./ChoiceGraphModal";
import { GAME_ID, GRAPH, renderWithQuery, stubFetch, stubFlowDom } from "./testGraph";

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
      save("s1", "3", "Before the bridge", "n-choice"),
      save("s2", "Auto 1", null, "n-choice"),
      save("s3", "7", "Somewhere", null),
      { system_id: "x", section: "todo", fields: { choice_node: "n-choice" } },
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

  it("badges a point with the viewer's saves on it and lists them in its panel", async () => {
    stubFetch(GRAPH);
    renderModal();
    const bridge = await screen.findByTestId("choice-node-n-choice");
    const badge = within(bridge).getByTestId("save-badge");
    expect(badge).toHaveTextContent("3 Auto 1");
    expect(badge).toHaveAttribute("title", "3 · Before the bridge\nAuto 1");
    // A save on nothing, and a non-save row naming the node, badge nothing.
    expect(within(screen.getByTestId("choice-node-n-start")).queryByTestId("save-badge")).toBeNull();

    fireEvent.click(bridge);
    const panel = screen.getByRole("complementary", { name: "Details" });
    expect(within(panel).getByText("3 · Before the bridge")).toBeInTheDocument();
    expect(within(panel).getByText("Auto 1")).toBeInTheDocument();
  });

  it("hides every edit control from a viewer who is not an admin", async () => {
    stubFetch(GRAPH);
    renderModal({ isAdmin: false });
    fireEvent.click(await screen.findByTestId("choice-node-n-choice"));

    expect(screen.queryByRole("button", { name: "Add point" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit point" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete point" })).not.toBeInTheDocument();
  });

  it("gives an admin the edit controls, and the delete asks once more", async () => {
    const fetchMock = stubFetch(GRAPH);
    renderModal({ isAdmin: true });
    expect(screen.getByRole("button", { name: "Add point" })).toBeInTheDocument();
    fireEvent.click(await screen.findByTestId("choice-node-n-choice"));

    expect(screen.getByRole("button", { name: "Edit point" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete point" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) => url === "/api/game-choice/nodes/n-choice" && init?.method === "DELETE",
        ),
      ).toBe(true),
    );
    // The point's saves lost their link server-side; the page re-reads them.
    await waitFor(() => expect(notesContext.reloadNotes).toHaveBeenCalled());
  });

  it("adds a point from the new-point form", async () => {
    const fetchMock = stubFetch(GRAPH);
    renderModal({ isAdmin: true });
    await screen.findByTestId("choice-node-n-choice");
    fireEvent.click(screen.getByRole("button", { name: "Add point" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "True end" } });
    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "ending" } });
    const panel = screen.getByRole("complementary", { name: "Details" });
    fireEvent.click(within(panel).getByRole("button", { name: "Add point" }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([url, init]) => url === "/api/game-choice/nodes" && init?.method === "POST",
      );
      expect(post).toBeTruthy();
      expect(JSON.parse(post[1].body)).toEqual({
        game_id: GAME_ID,
        kind: "ending",
        title: "True end",
        content: null,
        sort_index: 4,
      });
    });
  });

  it("marks a point done through its own endpoint, keeping the note", async () => {
    const fetchMock = stubFetch(GRAPH);
    renderModal({ canMark: true });
    fireEvent.click(await screen.findByTestId("choice-node-n-bad"));

    fireEvent.click(screen.getByRole("checkbox", { name: "Done" }));
    await waitFor(() => {
      const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
      expect(put[0]).toBe("/api/game-choice/nodes/n-bad/mark");
      expect(JSON.parse(put[1].body)).toEqual({ done: true, note: null });
    });
  });

  it("opens an option's panel for anyone, and marks it through the edge endpoint", async () => {
    const fetchMock = stubFetch(GRAPH);
    renderModal({ canMark: true });
    // jsdom measures nothing, so React Flow draws no edges here; the option
    // is opened from its point's panel, the other way to reach it.
    fireEvent.click(await screen.findByTestId("choice-node-n-choice"));
    fireEvent.click(screen.getByRole("button", { name: "Cross it → Good end" }));

    const panel = screen.getByRole("complementary", { name: "Details" });
    expect(within(panel).getByText("Cross it")).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "Save option" })).toBeNull();

    fireEvent.change(within(panel).getByLabelText("My note"), { target: { value: "Safe" } });
    fireEvent.blur(within(panel).getByLabelText("My note"));
    await waitFor(() => {
      const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
      expect(put[0]).toBe("/api/game-choice/edges/e2/mark");
      expect(JSON.parse(put[1].body)).toEqual({ done: false, note: "Safe" });
    });
  });

  it("shows the viewer's existing mark: a done point with its note", async () => {
    stubFetch(GRAPH);
    renderModal({ canMark: true });
    fireEvent.click(await screen.findByTestId("choice-node-n-good"));
    expect(screen.getByRole("checkbox", { name: "Done" })).toBeChecked();
    expect(screen.getByLabelText("My note")).toHaveValue("Got it");
  });

  it("offers no done box or note without self.personal_notes", async () => {
    stubFetch(GRAPH);
    renderModal({ canMark: false, isAdmin: true });
    fireEvent.click(await screen.findByTestId("choice-node-n-good"));
    expect(screen.queryByRole("checkbox", { name: "Done" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("My note")).not.toBeInTheDocument();
    // The done styling still comes from the marks the graph sent.
    expect(screen.getByTestId("choice-node-n-good")).toHaveAttribute("data-done", "true");
  });
});
