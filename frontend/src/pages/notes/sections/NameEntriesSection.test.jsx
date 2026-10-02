// Frontend: tests for NameEntriesSection's entries editor - the ordered list
// of notes and links inside one named list. Its items have no id of their
// own, so a move must carry each item's whole content to its new place, and
// what is saved is the list in its new order.
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import NameEntriesSection from "./NameEntriesSection";

const SECTION = {
  key: "guides",
  shape: "name_entries",
  label: "Guides",
  kinds: [],
  statuses: [],
  require_any: [],
  hierarchical: false,
  fields: [],
};

const NOTE = {
  system_id: "n1",
  section: "guides",
  title: "Route",
  kind: null,
  entries: [
    { type: "text", value: "first", label: null },
    { type: "link", value: "https://example.com/b", label: "second" },
    { type: "text", value: "third", label: null },
  ],
};

it("moves an entry with its drag handle and saves the new order", async () => {
  const user = userEvent.setup();
  const onUpdate = vi.fn();
  render(
    <NameEntriesSection
      section={SECTION}
      notes={[NOTE]}
      isAdmin
      onCreate={vi.fn()}
      onUpdate={onUpdate}
      onDelete={vi.fn()}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Edit" }));

  // The first entry cannot move up; the third moves above the second.
  fireEvent.keyDown(screen.getByLabelText("Reorder entry 1"), { key: "ArrowUp" });
  fireEvent.keyDown(screen.getByLabelText("Reorder entry 3"), { key: "ArrowUp" });
  expect(screen.getByLabelText("Entry 2 text")).toHaveValue("third");
  expect(screen.getByLabelText("Entry 3 URL")).toHaveValue("https://example.com/b");

  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(onUpdate).toHaveBeenCalledWith("n1", {
    title: "Route",
    kind: null,
    entries: [
      { type: "text", value: "first", label: null },
      { type: "text", value: "third", label: null },
      { type: "link", value: "https://example.com/b", label: "second" },
    ],
  });
});
