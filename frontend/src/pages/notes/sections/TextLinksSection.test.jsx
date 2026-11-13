// Frontend: tests for the `text_links` shape - a body, any number of URL
// links, and an episode where the section declares a locator placeholder.
//
// What these pin, on 彩蛋/致敬 Easter Eggs/References as it is registered: the episode is
// optional and a blank one draws nothing (no stray tag, no number), and the
// links are sent as URL strings - several of them, with no link text.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import TextLinksSection from "./TextLinksSection";

// Mirrors `easter_eggs` as /api/notes/sections reports it.
const EASTER_EGGS = {
  key: "easter_eggs",
  shape: "text_links",
  label: "彩蛋/致敬 Easter Eggs/References",
  locator_placeholder: "Episode(s), e.g. ep 3",
  locator_required: false,
  desc_required: false,
  link_pairs: false,
  fields: [],
};

const renderSection = (props = {}) =>
  render(
    <TextLinksSection
      section={EASTER_EGGS}
      notes={[]}
      isAdmin
      onCreate={() => {}}
      onUpdate={() => {}}
      onDelete={() => {}}
      onReorder={() => {}}
      {...props}
    />,
  );

it("draws nothing for a blank episode", () => {
  renderSection({
    notes: [
      { system_id: "n1", locator: null, content: "The poster.", links: [] },
      { system_id: "n2", locator: "", content: "The mug.", links: [] },
    ],
  });
  for (const text of ["The poster.", "The mug."]) {
    expect(screen.getByText(text).parentElement.textContent).toBe(text);
  }
});

it("shows an episode, a description and every link", () => {
  renderSection({
    notes: [
      {
        system_id: "n1",
        locator: "ep 3",
        content: "The poster.",
        links: ["https://b23.tv/x", "https://example.com/y"],
      },
    ],
  });
  expect(screen.getByText("ep 3")).toBeInTheDocument();
  expect(screen.getAllByRole("link")).toHaveLength(2);
});

it("sends an episode, a description and several URL strings", async () => {
  const onCreate = vi.fn();
  renderSection({ onCreate });

  await userEvent.click(screen.getByRole("button", { name: /^add$/i }));
  await userEvent.type(
    screen.getByPlaceholderText("Episode(s), e.g. ep 3"),
    "ep 3",
  );
  await userEvent.type(
    screen.getByPlaceholderText("Description (optional)"),
    "The poster.",
  );
  await userEvent.type(screen.getByPlaceholderText("https://..."), "https://b23.tv/x");
  await userEvent.click(screen.getByRole("button", { name: "+ Add link" }));
  await userEvent.type(
    screen.getAllByPlaceholderText("https://...")[1],
    "https://a.example/y",
  );
  // No link text: a text_links link is only its URL.
  expect(screen.queryByLabelText("Link text")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(onCreate).toHaveBeenCalledWith({
    section: "easter_eggs",
    locator: "ep 3",
    content: "The poster.",
    links: ["https://b23.tv/x", "https://a.example/y"],
  });
});

// --- Quick move between the 待辦 buckets ----------------------------------

// A todo bucket as /api/notes/sections serves it: `move_targets` names the
// owner's other buckets.
const TODO_NOW = {
  key: "todo_now",
  shape: "text_links",
  label: "現在 Now",
  locator_placeholder: null,
  locator_required: false,
  desc_required: true,
  link_pairs: false,
  fields: [],
  move_targets: [
    { key: "todo_next", label: "下一步 Next" },
    { key: "todo_later", label: "之後 Later" },
  ],
};

const TODO_ROW = { system_id: "t1", locator: null, content: "Beat Margit", links: [] };

it("moves a row to another bucket from its own select", async () => {
  const onUpdate = vi.fn();
  renderSection({ section: TODO_NOW, notes: [TODO_ROW], onUpdate });
  const move = screen.getByRole("combobox", { name: "Move Beat Margit to" });
  expect([...move.options].map((o) => o.textContent)).toEqual([
    "Move to…",
    "下一步 Next",
    "之後 Later",
  ]);
  await userEvent.selectOptions(move, "todo_later");
  expect(onUpdate).toHaveBeenCalledWith("t1", { section: "todo_later" });
});

it("offers no move on a section without targets", () => {
  renderSection({ section: { ...TODO_NOW, move_targets: [] }, notes: [TODO_ROW] });
  expect(screen.queryByRole("combobox", { name: /^Move / })).toBeNull();
  // Mirror: the row is still editable, so absence is the missing targets.
  expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
});

it("offers no move to a reader who cannot edit", () => {
  renderSection({ section: TODO_NOW, notes: [TODO_ROW], isAdmin: false });
  expect(screen.queryByRole("combobox", { name: /^Move / })).toBeNull();
});

it("hides the move while the row is being edited", async () => {
  renderSection({ section: TODO_NOW, notes: [TODO_ROW] });
  await userEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(screen.queryByRole("combobox", { name: /^Move / })).toBeNull();
});
