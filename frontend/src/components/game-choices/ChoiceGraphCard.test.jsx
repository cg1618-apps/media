// Frontend: the choice graph's preview card.
//
// Pins the card's three faces - empty, populated and failed - and that the
// first-point action and the done count follow their own permissions:
// manage.catalog (isAdmin) for the first, self.personal_notes for the second.
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ChoiceGraphCard from "./ChoiceGraphCard";
import { EMPTY_GRAPH, GAME_ID, GRAPH, renderWithQuery, stubFetch, stubFlowDom } from "./testGraph";

let auth;
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => auth }));

const viewer = ({ isAdmin = false, perms = [] } = {}) => ({
  isAdmin,
  has: (p) => perms.includes(p),
});

beforeEach(() => {
  stubFlowDom();
  auth = viewer();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.style.overflow = "";
});

describe("ChoiceGraphCard", () => {
  it("is titled and reads the graph for its game", async () => {
    const fetchMock = stubFetch(GRAPH);
    renderWithQuery(<ChoiceGraphCard gameId={GAME_ID} title="Game" />);
    expect(screen.getByText("分歧 Choices")).toBeInTheDocument();
    await screen.findByTestId("choice-preview");
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/game-choice/graph?game_id=${GAME_ID}`);
  });

  it("offers an admin the first point on an empty graph", async () => {
    stubFetch(EMPTY_GRAPH);
    auth = viewer({ isAdmin: true });
    renderWithQuery(<ChoiceGraphCard gameId={GAME_ID} />);

    expect(await screen.findByText(/No choice points yet/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View all" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add the first point" }));
    // The modal opens on the new-point form.
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("New point")).toBeInTheDocument();
  });

  it("shows the empty state without the action to anyone else", async () => {
    stubFetch(EMPTY_GRAPH);
    renderWithQuery(<ChoiceGraphCard gameId={GAME_ID} />);
    expect(await screen.findByText(/No choice points yet/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add the first point" })).not.toBeInTheDocument();
  });

  it("draws the preview with its counts and the viewer's done endings", async () => {
    stubFetch(GRAPH);
    auth = viewer({ perms: ["self.personal_notes"] });
    renderWithQuery(<ChoiceGraphCard gameId={GAME_ID} />);

    const counts = await screen.findByTestId("choice-counts");
    expect(counts).toHaveTextContent("4 points · 2 endings · 1 / 2 endings done");
    expect(screen.getByRole("button", { name: "View all" })).toBeInTheDocument();
    // The done mark reaches the preview's node.
    await waitFor(() =>
      expect(screen.getByTestId("choice-node-n-good")).toHaveAttribute("data-done", "true"),
    );
    expect(screen.getByTestId("choice-node-n-bad")).toHaveAttribute("data-done", "false");
  });

  it("leaves the done count out for a viewer who keeps no personal notes", async () => {
    stubFetch(GRAPH);
    renderWithQuery(<ChoiceGraphCard gameId={GAME_ID} />);
    const counts = await screen.findByTestId("choice-counts");
    expect(counts).toHaveTextContent("4 points · 2 endings");
    expect(counts).not.toHaveTextContent("done");
  });

  it("says so when the graph cannot be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        statusText: "Server Error",
        json: async () => ({ detail: "boom" }),
      })),
    );
    renderWithQuery(<ChoiceGraphCard gameId={GAME_ID} />);
    expect(await screen.findByText(/Could not load the choices: boom/)).toBeInTheDocument();
  });
});
