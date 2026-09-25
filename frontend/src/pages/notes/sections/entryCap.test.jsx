// Frontend: tests for the entry cap - a section shows its first three rows and
// folds the rest behind "Show all (N)" (`useEntryCap` / `ShowAllToggle` in
// ui.jsx).
//
// The rows are counted by their Edit buttons, which every shape draws through
// ItemActions, so one assertion serves every component whatever it renders.
// The cases that matter beyond the count: a row being edited is never folded
// away, the draft row is never folded away, a reorder that moves a row past
// the cap unfolds the section so the row does not vanish, and a grouped
// section caps each group rather than the section.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import EpisodeNameLinksSection from "./EpisodeNameLinksSection";
import EpisodeTextSection from "./EpisodeTextSection";
import MusicTrackSection from "./MusicTrackSection";
import NameEntriesSection from "./NameEntriesSection";
import NameLinksSection from "./NameLinksSection";
import StructuredSection from "./StructuredSection";
import TextLinksSection from "./TextLinksSection";
import TextOrLinkSection from "./TextOrLinkSection";
import TextSection from "./TextSection";
import { VISIBLE_ENTRIES, capEntries } from "./ui";

const section = (shape, extra = {}) => ({
  key: `s_${shape}`,
  shape,
  label: `Section ${shape}`,
  kinds: [],
  statuses: [],
  require_any: [],
  hierarchical: false,
  fields: [],
  ...extra,
});

const note = (i, extra = {}) => ({
  system_id: `n${i}`,
  section: "s",
  title: `row-${i}`,
  content: `row-${i}`,
  locator: null,
  kind: null,
  status: null,
  links: [],
  entries: [],
  fields: null,
  parent_id: null,
  ...extra,
});

const notes = (n) => Array.from({ length: n }, (_, i) => note(i + 1));

const handlers = () => ({
  onCreate: vi.fn(),
  onUpdate: vi.fn(),
  onDelete: vi.fn(),
  onReorder: vi.fn(),
});

const editButtons = (root = screen) => root.queryAllByRole("button", { name: "Edit" });

const STRUCTURED_FIELDS = [
  { key: "name", label: "Name", type: "text", column: "title", options: [] },
];

const SHAPES = [
  ["TextSection", TextSection, section("text")],
  ["TextLinksSection", TextLinksSection, section("text_links")],
  ["TextOrLinkSection", TextOrLinkSection, section("text_or_link")],
  ["EpisodeTextSection", EpisodeTextSection, section("episode_text")],
  ["NameLinksSection", NameLinksSection, section("name_links")],
  ["NameEntriesSection", NameEntriesSection, section("name_entries")],
  ["EpisodeNameLinksSection", EpisodeNameLinksSection, section("episode_name_links")],
  ["MusicTrackSection", MusicTrackSection, section("music_track")],
  [
    "StructuredSection",
    StructuredSection,
    section("structured", { fields: STRUCTURED_FIELDS }),
  ],
];

describe("capEntries", () => {
  const items = ["a", "b", "c", "d", "e"];

  it("keeps the first three when folded", () => {
    expect(capEntries(items, false)).toEqual(["a", "b", "c"]);
  });

  it("keeps everything when unfolded", () => {
    expect(capEntries(items, true)).toEqual(items);
  });

  it("keeps a pinned item past the cap, in its own place", () => {
    expect(capEntries(items, false, (x) => x === "e")).toEqual(["a", "b", "c", "e"]);
  });

  it("caps at three", () => {
    expect(VISIBLE_ENTRIES).toBe(3);
  });
});

describe.each(SHAPES)("%s", (_name, Component, sec) => {
  it("shows the first three rows and folds the rest", async () => {
    const user = userEvent.setup();
    render(<Component section={sec} notes={notes(5)} isAdmin {...handlers()} />);

    expect(editButtons()).toHaveLength(3);
    const toggle = screen.getByRole("button", { name: "Show all (5)" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);
    expect(editButtons()).toHaveLength(5);
    await user.click(screen.getByRole("button", { name: "Show less" }));
    expect(editButtons()).toHaveLength(3);
  });

  it("offers no toggle at three rows or fewer", () => {
    render(<Component section={sec} notes={notes(3)} isAdmin {...handlers()} />);
    expect(editButtons()).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /show all/i })).toBeNull();
  });
});

describe("a folded section never hides what is being written", () => {
  it("keeps a row being edited when the section folds", async () => {
    const user = userEvent.setup();
    render(<TextSection section={section("text")} notes={notes(5)} isAdmin {...handlers()} />);

    await user.click(screen.getByRole("button", { name: "Show all (5)" }));
    await user.click(editButtons()[4]);
    await user.click(screen.getByRole("button", { name: "Show less" }));

    expect(screen.getByDisplayValue("row-5")).toBeInTheDocument();
    // The first three plus the form; the fourth row stays folded.
    expect(screen.queryByText("row-4")).toBeNull();
    expect(editButtons()).toHaveLength(3);
  });

  it("shows the draft row of a folded section", async () => {
    const user = userEvent.setup();
    render(<TextSection section={section("text")} notes={notes(5)} isAdmin {...handlers()} />);

    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByPlaceholderText("Add item...")).toBeInTheDocument();
    expect(editButtons()).toHaveLength(3);
  });
});

describe("StructuredSection and the cap", () => {
  const sec = section("structured", { fields: STRUCTURED_FIELDS });

  it("reorders the rows it shows by their place in the whole section", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<StructuredSection section={sec} notes={notes(5)} isAdmin {...h} />);

    // The third row is not the last row of the section, so it can move down.
    const down = screen.getAllByRole("button", { name: "Move entry down" });
    expect(down).toHaveLength(3);
    expect(down[2]).not.toBeDisabled();

    await user.click(screen.getAllByRole("button", { name: "Move entry up" })[1]);
    expect(h.onReorder).toHaveBeenCalledWith(sec.key, ["n2", "n1", "n3", "n4", "n5"]);
  });

  it("unfolds when a move carries a row past the cap", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<StructuredSection section={sec} notes={notes(5)} isAdmin {...h} />);

    await user.click(screen.getAllByRole("button", { name: "Move entry down" })[2]);
    expect(h.onReorder).toHaveBeenCalledWith(sec.key, ["n1", "n2", "n4", "n3", "n5"]);
    expect(editButtons()).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Show less" })).toBeInTheDocument();
  });

  it("counts top-level rows only, and shows every child of a shown row", () => {
    const tree = section("structured", { fields: STRUCTURED_FIELDS, hierarchical: true });
    const rows = [
      note(1),
      ...[2, 3, 4, 5].map((i) => note(i, { parent_id: "n1" })),
      note(6),
    ];
    render(<StructuredSection section={tree} notes={rows} isAdmin {...handlers()} />);
    expect(editButtons()).toHaveLength(6);
    expect(screen.queryByRole("button", { name: /show all/i })).toBeNull();
  });
});

describe("a grouped StructuredSection caps each group", () => {
  const grouped = section("structured", {
    group_by: "who",
    fields: [
      { key: "who", label: "Who", type: "names", column: null, required: true, options: [] },
      ...STRUCTURED_FIELDS,
    ],
  });
  const row = (i, who) => note(i, { fields: { who } });

  it("folds a group past three rows and leaves a smaller group alone", async () => {
    const user = userEvent.setup();
    render(
      <StructuredSection
        section={grouped}
        notes={[row(1, ["A"]), row(2, ["A"]), row(3, ["A"]), row(4, ["A"]), row(5, ["B"])]}
        isAdmin
        {...handlers()}
      />,
    );

    const a = screen.getByRole("region", { name: "A" });
    const b = screen.getByRole("region", { name: "B" });
    expect(editButtons(within(a))).toHaveLength(3);
    expect(editButtons(within(b))).toHaveLength(1);
    expect(within(b).queryByRole("button", { name: /show all/i })).toBeNull();

    await user.click(within(a).getByRole("button", { name: "Show all (4)" }));
    expect(editButtons(within(a))).toHaveLength(4);
  });
});
