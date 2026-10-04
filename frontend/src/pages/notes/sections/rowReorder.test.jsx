// Frontend: tests for drag-to-reorder on the flat shapes (`useRowReorder` and
// friends in ui.jsx) - every shape but `structured`, whose own tests cover it.
//
// The grips are driven by keyboard (ArrowUp / ArrowDown on a focused grip),
// which is the path Sortable.jsx documents for tests. Every case runs against
// every shape, because the point of the shared helper is that no shape is the
// exception.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import EpisodeTextSection from "./EpisodeTextSection";
import MusicTrackSection from "./MusicTrackSection";
import NameEntriesSection from "./NameEntriesSection";
import NameLinksSection from "./NameLinksSection";
import TextLinksSection from "./TextLinksSection";
import TextOrLinkSection from "./TextOrLinkSection";
import TextSection from "./TextSection";
import { noteLabel } from "./ui";

const SHAPES = [
  ["text", TextSection],
  ["text_links", TextLinksSection],
  ["text_or_link", TextOrLinkSection],
  ["episode_text", EpisodeTextSection],
  ["name_links", NameLinksSection],
  ["name_entries", NameEntriesSection],
  ["music_track", MusicTrackSection],
];

const section = (shape) => ({
  key: `s_${shape}`,
  shape,
  label: `Section ${shape}`,
  kinds: [],
  statuses: [],
});

// `title` and `content` both carry the row's name, so every shape draws it
// and every grip is labelled by it.
const note = (i) => ({
  system_id: `n${i}`,
  title: `row-${i}`,
  content: `row-${i}`,
  locator: null,
  kind: null,
  status: null,
  links: [],
  entries: [],
});

const notes = (n) => Array.from({ length: n }, (_, i) => note(i + 1));

function renderShape(Component, shape, props = {}) {
  const onReorder = vi.fn();
  render(
    <Component
      section={section(shape)}
      notes={notes(4)}
      isAdmin
      onCreate={vi.fn()}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      onReorder={onReorder}
      {...props}
    />
  );
  return onReorder;
}

const grips = () => screen.queryAllByRole("button", { name: /^Reorder / });

describe.each(SHAPES)("%s", (shape, Component) => {
  it("moves a row and sends the whole section's order", () => {
    const onReorder = renderShape(Component, shape);
    fireEvent.keyDown(screen.getByLabelText("Reorder row-2"), { key: "ArrowUp" });
    expect(onReorder).toHaveBeenCalledWith(`s_${shape}`, ["n2", "n1", "n3", "n4"]);
  });

  it("unfolds the section when a row is moved past the fold", () => {
    const onReorder = renderShape(Component, shape);
    // Folded: three rows shown of four.
    expect(screen.queryByText("row-4")).toBeNull();
    fireEvent.keyDown(screen.getByLabelText("Reorder row-3"), { key: "ArrowDown" });
    expect(onReorder).toHaveBeenCalledWith(`s_${shape}`, ["n1", "n2", "n4", "n3"]);
    expect(screen.getAllByText("row-4").length).toBeGreaterThan(0);
  });

  it("gives a reader no grips", () => {
    renderShape(Component, shape, { isAdmin: false });
    expect(grips()).toHaveLength(0);
  });

  it("gives a section of one row no grip", () => {
    renderShape(Component, shape, { notes: notes(1) });
    expect(grips()).toHaveLength(0);
  });

  it("disables every grip while a move is being saved", () => {
    const onReorder = renderShape(Component, shape, { reordering: true });
    expect(grips().length).toBeGreaterThan(0);
    for (const grip of grips()) expect(grip).toBeDisabled();
    fireEvent.keyDown(screen.getByLabelText("Reorder row-2"), { key: "ArrowUp" });
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("hides the grip of the row being edited", () => {
    renderShape(Component, shape);
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    expect(screen.queryByLabelText("Reorder row-1")).toBeNull();
    expect(screen.getByLabelText("Reorder row-2")).toBeInTheDocument();
  });
});

describe("noteLabel", () => {
  it("names a row by its title, locator, text, then first link", () => {
    expect(noteLabel({ title: "OP1", locator: "Ep 1" })).toBe("OP1");
    expect(noteLabel({ locator: "Ep 3", content: "x" })).toBe("Ep 3");
    expect(noteLabel({ content: "a remark" })).toBe("a remark");
    expect(noteLabel({ links: ["https://a.example"] })).toBe("https://a.example");
    expect(noteLabel({ links: [{ text: "YouTube", url: "https://y" }] })).toBe("YouTube");
    expect(noteLabel({})).toBe("entry");
  });

  it("cuts a long text short", () => {
    expect(noteLabel({ content: "x".repeat(50) })).toBe(`${"x".repeat(40)}…`);
  });
});
