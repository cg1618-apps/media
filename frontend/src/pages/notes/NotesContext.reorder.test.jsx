// Frontend: tests for how the notes page saves a reorder (NotesContext's
// `onReorder`): the new order shows at once, the section's handles are frozen
// until the save has come back, and a failed save puts the stored order back
// and says why.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import NotesTemplate from "./NotesTemplate";
import { withSectionOrder } from "./NotesContext";
import * as api from "./api";

vi.mock("./api");

const CONTROLS = {
  key: "controls",
  shape: "structured",
  label: "操作 Controls",
  require_any: [],
  hierarchical: false,
  fields: [{ key: "control", label: "Control", type: "text", column: "title", options: [] }],
};

const row = (id, title, section = "controls") => ({ system_id: id, section, title });
const STORED = [row("a", "Jump"), row("b", "Dodge"), row("c", "Block")];

const titles = () =>
  screen.getAllByRole("button", { name: /^Reorder / }).map((h) => h.getAttribute("aria-label"));

// A promise the test settles by hand, so the in-flight state can be looked at.
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.mocked(api.fetchSections).mockResolvedValue([CONTROLS]);
  vi.mocked(api.fetchNotes).mockResolvedValue(STORED);
});

afterEach(() => {
  vi.resetAllMocks();
});

const renderPage = async () => {
  render(<NotesTemplate ownerType="game" ownerId="g1" isAdmin />);
  await screen.findByLabelText("Reorder Jump");
};

describe("onReorder", () => {
  it("shows the new order at once and freezes the handles until it is saved", async () => {
    const save = deferred();
    vi.mocked(api.reorderNotes).mockReturnValue(save.promise);
    await renderPage();

    fireEvent.keyDown(screen.getByLabelText("Reorder Jump"), { key: "ArrowDown" });
    expect(api.reorderNotes).toHaveBeenCalledWith("game", "g1", "controls", ["b", "a", "c"]);
    expect(titles()).toEqual(["Reorder Dodge", "Reorder Jump", "Reorder Block"]);
    expect(screen.getByLabelText("Reorder Block")).toBeDisabled();

    // A second move while the first is in flight is not sent.
    fireEvent.keyDown(screen.getByLabelText("Reorder Block"), { key: "ArrowUp" });
    expect(api.reorderNotes).toHaveBeenCalledTimes(1);

    vi.mocked(api.fetchNotes).mockResolvedValue([STORED[1], STORED[0], STORED[2]]);
    await act(async () => save.resolve({ status: "success" }));
    await waitFor(() => expect(screen.getByLabelText("Reorder Block")).not.toBeDisabled());
    expect(titles()).toEqual(["Reorder Dodge", "Reorder Jump", "Reorder Block"]);
  });

  it("puts the stored order back and says why when the save fails", async () => {
    const save = deferred();
    vi.mocked(api.reorderNotes).mockReturnValue(save.promise);
    await renderPage();

    fireEvent.keyDown(screen.getByLabelText("Reorder Jump"), { key: "ArrowDown" });
    expect(titles()).toEqual(["Reorder Dodge", "Reorder Jump", "Reorder Block"]);

    await act(async () => save.reject(new Error("ordered_ids must not name a note twice.")));
    await waitFor(() =>
      expect(titles()).toEqual(["Reorder Jump", "Reorder Dodge", "Reorder Block"]),
    );
    expect(screen.getByText("ordered_ids must not name a note twice.")).toBeInTheDocument();
    expect(screen.getByLabelText("Reorder Jump")).not.toBeDisabled();
  });
});

describe("withSectionOrder", () => {
  it("reorders one section's rows and leaves every other row where it was", () => {
    const notes = [row("x", "X", "other"), ...STORED, row("y", "Y", "other")];
    expect(withSectionOrder(notes, "controls", ["c", "a", "b"]).map((n) => n.system_id)).toEqual([
      "x",
      "c",
      "a",
      "b",
      "y",
    ]);
  });
});
