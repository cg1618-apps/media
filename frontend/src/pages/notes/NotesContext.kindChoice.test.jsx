// Frontend: mixed sections flagged `kind_choice` - 優點 Advantages, 缺點
// Disadvantages, 優缺點 - where the catalogue writer keeps rows of both kinds
// and picks each new row's kind, personal unless it asks.
//
// Mounted through NotesTemplate, so the rights come from rowAccessFor, the
// handlers from NotesProvider and the rows from TextLinksSection, as on a
// detail page. The section holds rows of BOTH kinds, so a missing control on
// one row is the gate refusing and not an empty list; each refusal below is
// asserted beside its mirror, on the same rows, with the same viewer.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import NotesTemplate from "./NotesTemplate";
import { rowAccessFor } from "./NotesContext";
import * as api from "./api";

vi.mock("./api");

let held = new Set();
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ has: (p) => held.has(p), hasFeature: () => true, userId: "me" }),
}));

// Mirrors `advantages` as /api/notes/sections reports it.
const ADVANTAGES = {
  key: "advantages",
  shape: "text_links",
  label: "優點 Advantages",
  scope: "catalog",
  mixed: true,
  kind_choice: true,
  locator_placeholder: null,
  desc_required: false,
  fields: [],
};

const row = (id, content, personal, author = "me") => ({
  system_id: id,
  section: "advantages",
  content,
  links: [],
  personal,
  author_id: author,
  sort_index: 0,
});

// A personal row is sent FIRST, so a drawn Public-first order is the page's
// doing, not the fixture's.
const ROWS = [
  row("p1", "My pick", true),
  row("c1", "Great art", false),
  // A public row somebody else wrote: the switch is never offered on it.
  row("c2", "Fine score", false, "someone-else"),
  row("p2", "My other pick", true),
];

const EDITOR = ["manage.catalog", "self.personal_notes"];
const USER = ["self.personal_notes"];

beforeEach(() => {
  localStorage.clear();
  vi.mocked(api.fetchSections).mockResolvedValue([ADVANTAGES]);
  vi.mocked(api.fetchNotes).mockResolvedValue(ROWS);
  vi.mocked(api.createNote).mockResolvedValue({ system_id: "new" });
  vi.mocked(api.updateNote).mockResolvedValue({});
  vi.mocked(api.switchNoteKind).mockResolvedValue({});
  vi.mocked(api.reorderNotes).mockResolvedValue({ status: "success" });
});

afterEach(() => {
  vi.resetAllMocks();
});

async function renderAs(permissions, rows = ROWS) {
  vi.mocked(api.fetchNotes).mockResolvedValue(rows);
  held = new Set(permissions);
  render(<NotesTemplate ownerType="game" ownerId="g1" />);
  await waitFor(() => expect(screen.getByText(rows[0].content)).toBeInTheDocument());
}

const headings = () => screen.queryAllByTestId("kind-heading").map((el) => el.textContent);
const rowOf = (text) => screen.getByText(text).closest(".border-t");
const controls = (text) => {
  const r = within(rowOf(text));
  return {
    edit: r.queryByRole("button", { name: "Edit" }),
    remove: r.queryByRole("button", { name: "Delete" }),
  };
};
const handle = (text) => screen.queryByRole("button", { name: `Reorder ${text}` });
const kindChoice = () => screen.queryByRole("group", { name: "Kind" });

async function openAdd() {
  await userEvent.click(screen.getByRole("button", { name: "Add" }));
  return screen.getByRole("dialog", { name: "Add to 優點 Advantages" });
}

describe("rowAccessFor in a kind_choice section", () => {
  const has = (list) => (p) => list.includes(p);

  it("lets a catalogue writer with personal notes choose, edit and move both kinds", () => {
    const access = rowAccessFor(ADVANTAGES, has(EDITOR));
    expect(access.canWrite).toBe(true);
    expect(access.choosesKind).toBe(true);
    expect(access.defaultPersonal).toBe(true);
    for (const personal of [true, false]) {
      expect(access.canEditRow({ personal })).toBe(true);
      expect(access.canMoveRow({ personal })).toBe(true);
    }
  });

  it("holds any other writer to its personal rows, with no choice", () => {
    const access = rowAccessFor(ADVANTAGES, has(USER));
    expect(access.canWrite).toBe(true);
    expect(access.choosesKind).toBe(false);
    expect(access.defaultPersonal).toBe(true);
    expect(access.canEditRow({ personal: true })).toBe(true);
    expect(access.canEditRow({ personal: false })).toBe(false);
    expect(access.canMoveRow({ personal: true })).toBe(true);
    expect(access.canMoveRow({ personal: false })).toBe(false);
  });

  it("gives a catalogue writer without personal notes public rows only", () => {
    const access = rowAccessFor(ADVANTAGES, has(["manage.catalog"]));
    expect(access.choosesKind).toBe(false);
    expect(access.defaultPersonal).toBe(false);
    expect(access.canEditRow({ personal: false })).toBe(true);
    expect(access.canEditRow({ personal: true })).toBe(false);
  });

  it("leaves a mixed section without the flag choosing nothing", () => {
    const access = rowAccessFor({ ...ADVANTAGES, kind_choice: false }, has(EDITOR));
    expect(access.choosesKind).toBeUndefined();
    expect(access.canMoveRow({ personal: true })).toBe(false);
  });
});

describe("grouping by kind", () => {
  it("draws Public over the public rows, then Personal over the viewer's own", async () => {
    await renderAs(USER);
    expect(headings()).toEqual(["Public", "Personal"]);
    const order = [...document.querySelectorAll("[data-testid='kind-heading'], p")]
      .map((el) => el.textContent)
      .filter((t) => ["Public", "Personal", "Great art", "Fine score", "My pick", "My other pick"].includes(t));
    expect(order).toEqual(["Public", "Great art", "Fine score", "Personal", "My pick", "My other pick"]);
  });

  it("draws no Personal heading when the viewer has no rows of its own", async () => {
    await renderAs(USER, [row("c1", "Great art", false)]);
    expect(headings()).toEqual(["Public"]);
  });

  it("draws no Public heading when there are no public rows", async () => {
    await renderAs(USER, [row("p1", "My pick", true)]);
    expect(headings()).toEqual(["Personal"]);
  });

  it("marks no personal row Mine, the heading already says so", async () => {
    await renderAs(USER);
    expect(screen.queryByText("Mine")).toBeNull();
  });
});

describe("the kind choice on Add", () => {
  it("defaults an editor to Personal and sends personal: true", async () => {
    await renderAs(EDITOR);
    const popup = await openAdd();
    expect(within(popup).getByRole("button", { name: "Personal" })).toHaveAttribute("aria-pressed", "true");
    expect(within(popup).getByRole("button", { name: "Public" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.type(within(popup).getByPlaceholderText("Description (optional)"), "Tight controls");
    await userEvent.click(within(popup).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(api.createNote).toHaveBeenCalledWith(
        expect.objectContaining({ section: "advantages", content: "Tight controls", personal: true }),
      ),
    );
  });

  it("sends personal: false when an editor picks Public", async () => {
    await renderAs(EDITOR);
    const popup = await openAdd();
    await userEvent.click(within(popup).getByRole("button", { name: "Public" }));
    expect(within(popup).getByRole("button", { name: "Public" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.type(within(popup).getByPlaceholderText("Description (optional)"), "Tight controls");
    await userEvent.click(within(popup).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(api.createNote).toHaveBeenCalledWith(
        expect.objectContaining({ content: "Tight controls", personal: false }),
      ),
    );
  });

  it("shows a non-editor no choice, and writes it a personal row", async () => {
    await renderAs(USER);
    const popup = await openAdd();
    expect(kindChoice()).toBeNull();
    await userEvent.type(within(popup).getByPlaceholderText("Description (optional)"), "Mine");
    await userEvent.click(within(popup).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(api.createNote).toHaveBeenCalledWith(expect.objectContaining({ personal: true })),
    );
  });

  it("shows the same choice to an editor, so the gate is what hides it", async () => {
    await renderAs(EDITOR);
    await openAdd();
    expect(kindChoice()).not.toBeNull();
  });
});

describe("row rights", () => {
  it("gives a non-editor no Edit or Delete on public rows, and both on its own", async () => {
    await renderAs(USER);
    expect(controls("Great art")).toEqual({ edit: null, remove: null });
    expect(controls("My pick").edit).not.toBeNull();
    expect(controls("My pick").remove).not.toBeNull();
  });

  it("gives an editor Edit and Delete on both kinds", async () => {
    await renderAs(EDITOR);
    for (const text of ["Great art", "My pick"]) {
      expect(controls(text).edit).not.toBeNull();
      expect(controls(text).remove).not.toBeNull();
    }
  });
});

describe("switching kind on edit", () => {
  it("calls the kind endpoint alone when only the kind changed", async () => {
    await renderAs(EDITOR);
    await userEvent.click(controls("My pick").edit);
    const choice = kindChoice();
    expect(within(choice).getByRole("button", { name: "Personal" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(choice).getByRole("button", { name: "Public" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.switchNoteKind).toHaveBeenCalledWith("p1", false));
    expect(api.updateNote).not.toHaveBeenCalled();
    // The list is reloaded from the server, which put the row in its new kind.
    expect(api.fetchNotes).toHaveBeenCalledTimes(2);
  });

  it("writes changed content first, then switches the kind", async () => {
    await renderAs(EDITOR);
    await userEvent.click(controls("My pick").edit);
    await userEvent.click(within(kindChoice()).getByRole("button", { name: "Public" }));
    await userEvent.type(screen.getByDisplayValue("My pick"), "!");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.switchNoteKind).toHaveBeenCalledWith("p1", false));
    expect(api.updateNote).toHaveBeenCalledWith("p1", expect.objectContaining({ content: "My pick!" }));
    expect(vi.mocked(api.updateNote).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(api.switchNoteKind).mock.invocationCallOrder[0],
    );
  });

  it("only updates the content when the kind is left alone", async () => {
    await renderAs(EDITOR);
    await userEvent.click(controls("My pick").edit);
    await userEvent.type(screen.getByDisplayValue("My pick"), "!");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.updateNote).toHaveBeenCalled());
    expect(api.switchNoteKind).not.toHaveBeenCalled();
  });

  // The server switches the viewer's own rows only. A public row the editor
  // wrote can go back to personal; one somebody else wrote offers no choice.
  it("switches a public row the editor wrote back to personal", async () => {
    await renderAs(EDITOR);
    await userEvent.click(controls("Great art").edit);
    const choice = kindChoice();
    expect(within(choice).getByRole("button", { name: "Public" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(choice).getByRole("button", { name: "Personal" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.switchNoteKind).toHaveBeenCalledWith("c1", true));
  });

  it("offers no choice on a public row somebody else wrote", async () => {
    await renderAs(EDITOR);
    await userEvent.click(controls("Fine score").edit);
    expect(kindChoice()).toBeNull();
  });

  it("offers a non-editor no choice on its own row", async () => {
    await renderAs(USER);
    await userEvent.click(controls("My pick").edit);
    expect(kindChoice()).toBeNull();
  });
});

describe("reorder within a kind", () => {
  it("sends an editor's public move with personal: false", async () => {
    await renderAs(EDITOR);
    fireEvent.keyDown(handle("Great art"), { key: "ArrowDown" });
    expect(api.reorderNotes).toHaveBeenCalledWith("game", "g1", "advantages", ["c2", "c1"], false);
  });

  it("sends an editor's personal move with personal: true", async () => {
    await renderAs(EDITOR);
    fireEvent.keyDown(handle("My pick"), { key: "ArrowDown" });
    expect(api.reorderNotes).toHaveBeenCalledWith("game", "g1", "advantages", ["p2", "p1"], true);
  });

  it("gives a non-editor handles on its own rows only", async () => {
    await renderAs(USER);
    expect(handle("Great art")).toBeNull();
    expect(handle("Fine score")).toBeNull();
    fireEvent.keyDown(handle("My pick"), { key: "ArrowDown" });
    expect(api.reorderNotes).toHaveBeenCalledWith("game", "g1", "advantages", ["p2", "p1"], true);
  });
});
