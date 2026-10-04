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
