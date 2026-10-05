// Frontend: tests for the `name_links` shape - Resources - and its optional
// Group, which is `kind` on a section flagged `kind_is_group`.
//
// What these pin: with no row grouped the list draws exactly as an ungrouped
// one, with no headings; once any row has a group, one heading per group in
// the order each first appears, and the ungrouped rows last under "Other";
// a reorder sends the rows in that drawn order; and the form's Group field is
// optional, suggested from the groups already used, and never enough on its
// own to make a row.
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import NameLinksSection from "./NameLinksSection";

// Mirrors `resources` as /api/notes/sections reports it.
const RESOURCES = {
  key: "resources",
  shape: "name_links",
  label: "Resources",
  kinds: [],
  statuses: [],
  kind_is_group: true,
};

const row = (id, title, kind = null) => ({
  system_id: id,
  title,
  kind,
  links: [`https://example.com/${id}`],
});

function renderSection(props = {}) {
  const handlers = {
    onCreate: vi.fn(),
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    onReorder: vi.fn(),
  };
  render(
    <NameLinksSection section={RESOURCES} notes={[]} isAdmin {...handlers} {...props} />,
  );
  return handlers;
}

// The headings and row titles in the order they are drawn.
const drawn = () =>
  screen
    .getAllByTestId(/^(group-heading|resource-title)$/)
    .map((el) => el.textContent);

it("draws an ungrouped list with no headings", () => {
  renderSection({ notes: [row("a", "One"), row("b", "Two")] });
  expect(screen.queryAllByTestId("group-heading")).toEqual([]);
  expect(drawn()).toEqual(["One", "Two"]);
});

it("draws one heading per group in first-appearance order, ungrouped last under Other", () => {
  renderSection({
    notes: [
      row("a", "Loose"),
      row("b", "Artbook", "設定資料"),
      row("c", "Stream", "觀看"),
      row("d", "Wiki", "設定資料"),
    ],
  });
  fireEvent.click(screen.getByRole("button", { name: /Show all/ }));
  expect(drawn()).toEqual([
    "設定資料",
    "Artbook",
    "Wiki",
    "觀看",
    "Stream",
    "Other",
    "Loose",
  ]);
});

it("treats a blank group as no group", () => {
  renderSection({ notes: [row("a", "One", "  "), row("b", "Two", "設定資料")] });
  expect(drawn()).toEqual(["設定資料", "Two", "Other", "One"]);
});

it("reorders in the drawn order", () => {
  const { onReorder } = renderSection({
    notes: [row("a", "Loose"), row("b", "Artbook", "設定資料"), row("c", "Wiki", "設定資料")],
  });
  // Drawn: Artbook, Wiki, Loose. Moving Wiki up puts it first.
  fireEvent.keyDown(screen.getByLabelText("Reorder Wiki"), { key: "ArrowUp" });
  expect(onReorder).toHaveBeenCalledWith("resources", ["c", "b", "a"]);
});

it("sends a trimmed group, suggested from the groups already used", async () => {
  const user = userEvent.setup();
  const { onCreate } = renderSection({
    notes: [row("a", "Artbook", "設定資料"), row("b", "Wiki", "設定資料")],
  });
  await user.click(screen.getByRole("button", { name: /add/i }));
  const group = screen.getByPlaceholderText("Group (optional)");
  const options = within(document.getElementById(group.getAttribute("list")))
    .getAllByRole("option", { hidden: true })
    .map((o) => o.value);
  expect(options).toEqual(["設定資料"]);

  await user.type(screen.getByPlaceholderText("Name (optional)"), "Guide");
  await user.type(group, "  攻略  ");
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(onCreate).toHaveBeenCalledWith({
    section: "resources",
    title: "Guide",
    links: [],
    kind: "攻略",
  });
});

it("sends no group when the field is left blank", async () => {
  const user = userEvent.setup();
  const { onCreate } = renderSection();
  await user.click(screen.getByRole("button", { name: /add/i }));
  await user.type(screen.getByPlaceholderText("Name (optional)"), "Guide");
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(onCreate).toHaveBeenCalledWith({
    section: "resources",
    title: "Guide",
    links: [],
    kind: null,
  });
});

it("does not save a row that has only a group", async () => {
  const user = userEvent.setup();
  const { onCreate } = renderSection();
  await user.click(screen.getByRole("button", { name: /add/i }));
  await user.type(screen.getByPlaceholderText("Group (optional)"), "攻略");
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(onCreate).not.toHaveBeenCalled();
});

it("offers no Group field on a section without the flag", async () => {
  const user = userEvent.setup();
  const { onCreate } = renderSection({ section: { ...RESOURCES, kind_is_group: false } });
  await user.click(screen.getByRole("button", { name: /add/i }));
  expect(screen.queryByPlaceholderText("Group (optional)")).toBeNull();
  await user.type(screen.getByPlaceholderText("Name (optional)"), "Guide");
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(onCreate).toHaveBeenCalledWith({ section: "resources", title: "Guide", links: [] });
});
