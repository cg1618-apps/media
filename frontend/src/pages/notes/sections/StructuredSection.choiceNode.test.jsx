// Frontend: the `choice_node` field - a save's "At node", pointing into the
// owner game's choice graph.
//
// Read, it is the linked point's title (and nothing when unset or unknown);
// edited, a select of the game's points grouped by kind, with an empty option
// that clears the link. The value is stored in `fields`, like based_on.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GAME_ID, GRAPH, renderWithQuery, stubFetch } from "../../../components/game-choices/testGraph";
import StructuredSection from "./StructuredSection";

// The saves section as the registry serves it.
const SAVES = {
  key: "saves",
  shape: "structured",
  label: "存檔 Saves",
  require_any: [["number", "name"]],
  hierarchical: false,
  fields: [
    { key: "number", label: "No.", type: "text", column: "locator", options: [] },
    { key: "name", label: "Name", type: "text", column: "title", options: [] },
    { key: "based_on", label: "Based on slot", type: "text", column: null, options: [] },
    { key: "choice_node", label: "At node", type: "choice_node", column: null, options: [] },
  ],
};

const save = (fields) => ({
  system_id: "s1",
  section: "saves",
  locator: "3",
  title: "Before the bridge",
  fields,
});

const renderSection = (notes, props = {}) =>
  renderWithQuery(
    <StructuredSection
      section={SAVES}
      notes={notes}
      isAdmin
      ownerId={GAME_ID}
      onCreate={vi.fn()}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      {...props}
    />,
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("StructuredSection choice_node field", () => {
  it("reads as the linked point's title", async () => {
    const fetchMock = stubFetch(GRAPH);
    renderSection([save({ choice_node: "n-choice" })]);
    expect(await screen.findByText("At node: The bridge")).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/game-choice/graph?game_id=${GAME_ID}`);
  });

  it("reads as nothing when unset or naming a point the graph does not hold", async () => {
    const fetchMock = stubFetch(GRAPH);
    renderSection([save({ choice_node: "gone" })]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText(/At node/)).not.toBeInTheDocument();
  });

  it("edits as a select of the game's points, grouped by kind, and saves into fields", async () => {
    stubFetch(GRAPH);
    const onUpdate = vi.fn();
    renderSection([save({ based_on: "1" })], { onUpdate });

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    const select = screen.getByRole("combobox", { name: "At node" });
    await waitFor(() => expect(within(select).getByRole("option", { name: "Good end" })).toBeInTheDocument());

    const groups = [...select.querySelectorAll("optgroup")].map((g) => g.label);
    expect(groups).toEqual(["Start", "Choice", "Ending"]);
    expect(within(select).getByRole("option", { name: "At node: none" })).toHaveValue("");

    fireEvent.change(select, { target: { value: "n-good" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(onUpdate).toHaveBeenCalledWith(
      "s1",
      expect.objectContaining({ fields: { based_on: "1", choice_node: "n-good" } }),
    );
  });

  it("clears the link with the empty option", async () => {
    stubFetch(GRAPH);
    const onUpdate = vi.fn();
    renderSection([save({ based_on: "1", choice_node: "n-good" })], { onUpdate });

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    const select = screen.getByRole("combobox", { name: "At node" });
    await waitFor(() => expect(select).toHaveValue("n-good"));
    fireEvent.change(select, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(onUpdate).toHaveBeenCalledWith(
      "s1",
      expect.objectContaining({ fields: { based_on: "1" } }),
    );
  });
});
