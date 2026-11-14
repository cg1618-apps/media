// Frontend: a detail page's table of contents lists what actually rendered.
//
// The rows are read from the page, so the tests assert both halves: a section
// that rendered is listed, and one that rendered nothing (an empty TocSection,
// a note group's own sections) is not. The empty-section case only bites
// because a rendered sibling is listed in the same render.
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DetailContents, { TocSection } from "./DetailContents";
import NotesTemplate from "../../pages/notes/NotesTemplate";
import * as api from "../../pages/notes/api";

vi.mock("../../pages/notes/api");
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ has: () => false }),
}));

// One ungrouped section (the Notes card), and a group of two: the group is a
// row, its two sections are not.
const SECTIONS = [
  { key: "trivia", shape: "text", label: "Trivia", kinds: [] },
  {
    key: "beginner",
    shape: "text",
    label: "Beginner",
    kinds: [],
    group: "guides",
    group_label: "攻略 Guides",
  },
  {
    key: "controls",
    shape: "text",
    label: "Controls",
    kinds: [],
    group: "guides",
    group_label: "攻略 Guides",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchSections).mockResolvedValue(SECTIONS);
  vi.mocked(api.fetchNotes).mockResolvedValue([]);
});

const Nothing = () => null;

function mount() {
  return render(
    <MemoryRouter>
      <DetailContents>
        <TocSection id="naming" label="Naming">
          <p>names</p>
        </TocSection>
        <TocSection id="cast" label="Cast">
          <Nothing />
        </TocSection>
        <NotesTemplate ownerType="anime" ownerId="abc" />
      </DetailContents>
    </MemoryRouter>,
  );
}

const contents = () => screen.getByRole("navigation", { name: "Contents" });
const rows = () => within(contents()).getAllByRole("button").map((b) => b.textContent);

describe("DetailContents", () => {
  it("lists the rendered sections, then the note cards once they load", async () => {
    mount();
    await waitFor(() => expect(rows()).toEqual(["Naming", "Notes", "攻略 Guides"]));
  });

  it("does not list a section that rendered nothing", async () => {
    mount();
    await waitFor(() => expect(rows()).toContain("Naming"));
    expect(rows()).not.toContain("Cast");
  });

  it("lists a note group but not the sections inside it", async () => {
    mount();
    await waitFor(() => expect(rows()).toContain("攻略 Guides"));
    expect(rows()).not.toContain("Beginner");
    expect(rows()).not.toContain("Controls");
  });

  it("anchors each row to its section", async () => {
    mount();
    await waitFor(() => expect(rows()).toContain("攻略 Guides"));
    expect(document.getElementById("naming")).toHaveAttribute("data-toc", "Naming");
    expect(document.getElementById("notes-guides")).toHaveAttribute("data-toc", "攻略 Guides");
  });
});
