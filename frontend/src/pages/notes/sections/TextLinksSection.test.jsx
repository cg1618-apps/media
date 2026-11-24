// Frontend: tests for the `text_links` shape - a body, any number of titled
// links, and an episode where the section declares a locator placeholder.
//
// What these pin, on 彩蛋/致敬/細節 Easter Eggs/References/Details as it is registered: the episode is
// optional and a blank one draws nothing (no stray tag, no number), and the
// links are sent as titled pairs - several of them, the title optional - and a
// row may be a description, titled links, or both.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import TextLinksSection from "./TextLinksSection";

// Mirrors `easter_eggs` as /api/notes/sections reports it.
const EASTER_EGGS = {
  key: "easter_eggs",
  shape: "text_links",
  label: "彩蛋/致敬/細節 Easter Eggs/References/Details",
  locator_placeholder: "Episode(s), e.g. ep 3",
  locator_required: false,
  desc_required: false,
  kind_is_group: true,
  kind_category: "Easter Egg Group",
  fields: [],
};

const renderSection = (props = {}) =>
  render(
    <TextLinksSection
      section={EASTER_EGGS}
      notes={[]}
      canWrite
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

it("sends an episode, a description and several titled links", async () => {
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
  await userEvent.type(screen.getByLabelText("Link text"), "Bilibili");
  await userEvent.type(screen.getByPlaceholderText("https://..."), "https://b23.tv/x");
  await userEvent.click(screen.getByRole("button", { name: "+ Add link" }));
  await userEvent.type(
    screen.getAllByPlaceholderText("https://...")[1],
    "https://a.example/y",
  );
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  // The title is optional: the second link goes without one.
  expect(onCreate).toHaveBeenCalledWith({
    section: "easter_eggs",
    locator: "ep 3",
    content: "The poster.",
    links: [
      { text: "Bilibili", url: "https://b23.tv/x" },
      { text: null, url: "https://a.example/y" },
    ],
    kind: null,
  });
});

it("saves titled links with no description", async () => {
  const onCreate = vi.fn();
  renderSection({ onCreate });

  await userEvent.click(screen.getByRole("button", { name: /^add$/i }));
  await userEvent.type(screen.getByLabelText("Link text"), "Review");
  await userEvent.type(screen.getByPlaceholderText("https://..."), "https://b23.tv/x");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(onCreate).toHaveBeenCalledWith(
    expect.objectContaining({
      content: null,
      links: [{ text: "Review", url: "https://b23.tv/x" }],
    }),
  );
});

it("holds Save back while a title waits for its URL", async () => {
  const onCreate = vi.fn();
  renderSection({ onCreate });

  await userEvent.click(screen.getByRole("button", { name: /^add$/i }));
  await userEvent.type(
    screen.getByPlaceholderText("Description (optional)"),
    "The poster.",
  );
  await userEvent.type(screen.getByLabelText("Link text"), "Review");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onCreate).not.toHaveBeenCalled();

  // The mirror: the same row with the URL filled saves.
  await userEvent.type(screen.getByPlaceholderText("https://..."), "https://b23.tv/x");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onCreate).toHaveBeenCalled();
});

it("labels each pill with its title, or its host without one", () => {
  renderSection({
    notes: [
      {
        system_id: "n1",
        content: "x",
        links: [
          { text: "Bilibili", url: "https://b23.tv/x" },
          { text: null, url: "https://a.example/y" },
        ],
      },
    ],
  });
  expect(screen.getByRole("link", { name: /Bilibili/ })).toHaveAttribute(
    "href",
    "https://b23.tv/x",
  );
  expect(screen.getByRole("link", { name: /a\.example/ })).toBeInTheDocument();
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
  renderSection({ section: TODO_NOW, notes: [TODO_ROW], canWrite: false });
  expect(screen.queryByRole("combobox", { name: /^Move / })).toBeNull();
});

it("hides the move while the row is being edited", async () => {
  renderSection({ section: TODO_NOW, notes: [TODO_ROW] });
  await userEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(screen.queryByRole("combobox", { name: /^Move / })).toBeNull();
});

it("draws one heading per group, the ungrouped rows last under Other", () => {
  renderSection({
    notes: [
      { system_id: "n1", content: "A loose one.", links: [], kind: null },
      { system_id: "n2", content: "The director.", links: [], kind: "Cameos" },
      { system_id: "n3", content: "The mug.", links: [], kind: "Callbacks" },
    ],
  });
  expect(
    screen.getAllByTestId("group-heading").map((h) => h.textContent),
  ).toEqual(["Cameos", "Callbacks", "Other"]);
  // Drawn in grouped order, so the ungrouped row moves to the end.
  const order = ["The director.", "The mug.", "A loose one."].map((t) =>
    screen.getByText(t),
  );
  for (let i = 1; i < order.length; i += 1) {
    expect(
      order[i - 1].compareDocumentPosition(order[i]) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  }
});

it("draws no heading while no row has a group", () => {
  renderSection({
    notes: [{ system_id: "n1", content: "The poster.", links: [], kind: null }],
  });
  expect(screen.queryByTestId("group-heading")).toBeNull();
});

it("suggests the common option's groups and the owner's own, and sends the group", async () => {
  const user = userEvent.setup();
  const onCreate = vi.fn();
  renderSection({
    onCreate,
    notes: [{ system_id: "n1", content: "x.", links: [], kind: "Cameos" }],
    optionValues: { "Easter Egg Group": ["Callbacks", "Cameos"] },
  });
  await user.click(screen.getByRole("button", { name: /add/i }));
  const group = screen.getByPlaceholderText("Group (optional)");
  const options = within(document.getElementById(group.getAttribute("list")))
    .getAllByRole("option", { hidden: true })
    .map((o) => o.value);
  expect(options).toEqual(["Cameos", "Callbacks"]);
  await user.type(group, "  Callbacks ");
  await user.type(screen.getByPlaceholderText("Description (optional)"), "The mug");
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(onCreate).toHaveBeenCalledWith(
    expect.objectContaining({ section: "easter_eggs", content: "The mug", kind: "Callbacks" }),
  );
});

it("offers no group on a section without the flag", async () => {
  const user = userEvent.setup();
  const onCreate = vi.fn();
  renderSection({
    onCreate,
    section: { ...EASTER_EGGS, kind_is_group: false, kind_category: null },
  });
  await user.click(screen.getByRole("button", { name: /add/i }));
  expect(screen.queryByPlaceholderText("Group (optional)")).toBeNull();
  await user.type(screen.getByPlaceholderText("Description (optional)"), "The mug");
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(onCreate.mock.calls[0][0]).not.toHaveProperty("kind");
});

// 優點, 缺點 and 優缺點 mix public rows with each viewer's own
// (`kind_choice`), so their title carries M rather than a personal section's P.
it("marks a kind-choice section M, and an ordinary one with neither M nor P", () => {
  const advantages = {
    ...EASTER_EGGS,
    key: "advantages",
    label: "優點 Advantages",
    scope: "catalog",
    mixed: true,
    kind_choice: true,
  };
  const { unmount } = renderSection({ section: advantages });
  expect(screen.getByRole("img", { name: "Mixed" })).toHaveTextContent("M");
  expect(screen.queryByRole("img", { name: "Personal" })).toBeNull();
  unmount();

  renderSection();
  expect(screen.queryByRole("img", { name: "Mixed" })).toBeNull();
  expect(screen.queryByRole("img", { name: "Personal" })).toBeNull();
});
