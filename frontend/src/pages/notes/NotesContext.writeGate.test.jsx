// Frontend: who may write which section of the notes page.
//
// Write controls follow each section's `scope`, not one page-wide flag: a
// catalogue section needs manage.catalog and a personal one
// self.personal_notes - the permissions the server takes for the writes. The
// root flag does not pass self.*, so an admin reads a personal section
// without its controls. Quotes and memes are catalogue tables, drawn for an
// account with the quotes_memes feature, which every viewer here holds.
//
// Both sections hold a row, so a missing Edit or Delete is the gate refusing
// and not an empty list; each viewer is asserted on both sections, so one
// passing case proves the other's refusal.
import { render, screen, waitFor, within } from "@testing-library/react";

import NotesTemplate from "./NotesTemplate";
import { writePermissionFor } from "./NotesContext";
import * as api from "./api";

vi.mock("./api");
vi.mock("./sections/QuoteSection", () => ({
  default: ({ canWrite }) => <p>quotes canWrite={String(canWrite)}</p>,
}));

let held = new Set();
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ has: (p) => held.has(p), hasFeature: (f) => f === "quotes_memes" }),
}));

const TRIVIA = { key: "trivia", shape: "text", label: "Trivia", kinds: [], scope: "catalog" };
const NG_GOALS = {
  key: "ng_goals",
  shape: "text_links",
  label: "下周目目標 NG+ Goals",
  scope: "personal",
  fields: [],
};
const QUOTES = { key: "quotes", shape: "external", label: "Quotes", scope: "catalog" };

const ROWS = [
  { system_id: "c1", section: "trivia", content: "a catalogue fact", sort_index: 0 },
  { system_id: "p1", section: "ng_goals", content: "my own goal", links: [], sort_index: 0 },
];

beforeEach(() => {
  vi.mocked(api.fetchSections).mockResolvedValue([TRIVIA, NG_GOALS, QUOTES]);
  vi.mocked(api.fetchNotes).mockResolvedValue(ROWS);
});

// A section's own card: the SectionCard wrapping its heading.
const card = (label) => screen.getByText(label).closest(".bg-surface");
const controls = (label) => {
  const c = within(card(label));
  return {
    add: c.queryByRole("button", { name: "Add" }),
    edit: c.queryByRole("button", { name: "Edit" }),
    remove: c.queryByRole("button", { name: "Delete" }),
  };
};

async function renderAs(permissions) {
  held = new Set(permissions);
  render(<NotesTemplate ownerType="game" ownerId="g1" />);
  await waitFor(() => expect(screen.getByText("my own goal")).toBeInTheDocument());
  expect(screen.getByText("a catalogue fact")).toBeInTheDocument();
}

describe("writePermissionFor", () => {
  it("asks manage.catalog for a catalogue or external section, self.personal_notes for a personal one", () => {
    expect(writePermissionFor(TRIVIA)).toBe("manage.catalog");
    expect(writePermissionFor(NG_GOALS)).toBe("self.personal_notes");
    expect(writePermissionFor({ ...QUOTES, scope: "personal" })).toBe("manage.catalog");
  });
});

describe("per-section write gating", () => {
  it("gives a user write controls on its personal section and none on a catalogue one", async () => {
    await renderAs(["self.list", "self.personal_notes"]);

    const personal = controls("下周目目標 NG+ Goals");
    expect(personal.add).not.toBeNull();
    expect(personal.edit).not.toBeNull();
    expect(personal.remove).not.toBeNull();

    const catalogue = controls("Trivia");
    expect(catalogue.add).toBeNull();
    expect(catalogue.edit).toBeNull();
    expect(catalogue.remove).toBeNull();

    expect(screen.getByText("quotes canWrite=false")).toBeInTheDocument();
  });

  it("gives a catalogue writer without self.personal_notes the mirror", async () => {
    await renderAs(["manage.catalog"]);

    const catalogue = controls("Trivia");
    expect(catalogue.add).not.toBeNull();
    expect(catalogue.edit).not.toBeNull();
    expect(catalogue.remove).not.toBeNull();

    const personal = controls("下周目目標 NG+ Goals");
    expect(personal.add).toBeNull();
    expect(personal.edit).toBeNull();
    expect(personal.remove).toBeNull();

    expect(screen.getByText("quotes canWrite=true")).toBeInTheDocument();
  });
});
