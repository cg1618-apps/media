// Frontend: tests for the `episode_text` shape - an episode, a kind where the
// section declares one, a description, and links where the section
// `takes_links`.
//
// What these pin: OP/ED 變動 (takes_links) draws its links and edits them with
// the same repeatable URL editor as text_links, sending URL strings; 加長
// (no takes_links) shows no link editor and sends no `links` at all.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import EpisodeTextSection from "./EpisodeTextSection";

// Mirrors `op_ed_changes` as /api/notes/sections reports it.
const OP_ED_CHANGES = {
  key: "op_ed_changes",
  shape: "episode_text",
  label: "OP/ED 變動",
  kinds: ["變化OP", "變化ED", "無OP", "無ED", "特殊OP", "特殊ED"],
  locator_placeholder: "Episode(s), e.g. ep 3",
  locator_required: true,
  desc_required: false,
  takes_links: true,
  link_pairs: false,
  fields: [],
};

// Mirrors `extended_episodes`: the same shape, no kinds, no links.
const EXTENDED = {
  ...OP_ED_CHANGES,
  key: "extended_episodes",
  label: "加長",
  kinds: [],
  takes_links: false,
};

const renderSection = (props = {}) =>
  render(
    <EpisodeTextSection
      section={OP_ED_CHANGES}
      notes={[]}
      isAdmin
      onCreate={() => {}}
      onUpdate={() => {}}
      onDelete={() => {}}
      onReorder={() => {}}
      {...props}
    />,
  );

it("shows every link of a row that takes them", () => {
  renderSection({
    notes: [
      {
        system_id: "n1",
        locator: "ep 10",
        kind: "變化OP",
        content: "換成劇中曲",
        links: ["https://youtu.be/a", "https://b23.tv/b"],
      },
    ],
  });
  expect(screen.getAllByRole("link")).toHaveLength(2);
});

it("draws no stray 0 for a row with no links", () => {
  renderSection({
    notes: [{ system_id: "n1", locator: "ep 10", content: "換成劇中曲", links: [] }],
  });
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(screen.getByText("換成劇中曲").parentElement.textContent).toBe(
    "ep 10換成劇中曲",
  );
});

it("sends an episode, a kind and several URL strings", async () => {
  const onCreate = vi.fn();
  renderSection({ onCreate });

  await userEvent.click(screen.getByRole("button", { name: /^add$/i }));
  await userEvent.type(
    screen.getByPlaceholderText("Episode(s), e.g. ep 3"),
    "ep 10",
  );
  await userEvent.selectOptions(screen.getByRole("combobox"), "變化OP");
  await userEvent.type(screen.getByPlaceholderText("https://..."), "https://youtu.be/a");
  await userEvent.click(screen.getByRole("button", { name: "+ Add link" }));
  await userEvent.type(
    screen.getAllByPlaceholderText("https://...")[1],
    "https://b23.tv/b",
  );
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(onCreate).toHaveBeenCalledWith({
    section: "op_ed_changes",
    locator: "ep 10",
    kind: "變化OP",
    content: null,
    links: ["https://youtu.be/a", "https://b23.tv/b"],
  });
});

it("edits a row's existing links", async () => {
  const onUpdate = vi.fn();
  renderSection({
    onUpdate,
    notes: [
      { system_id: "n1", locator: "ep 10", kind: null, content: null, links: ["https://youtu.be/a"] },
    ],
  });

  await userEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(screen.getByPlaceholderText("https://...")).toHaveValue("https://youtu.be/a");
  await userEvent.click(screen.getByRole("button", { name: "+ Add link" }));
  await userEvent.type(
    screen.getAllByPlaceholderText("https://...")[1],
    "https://b23.tv/b",
  );
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(onUpdate).toHaveBeenCalledWith("n1", {
    locator: "ep 10",
    kind: null,
    content: null,
    links: ["https://youtu.be/a", "https://b23.tv/b"],
  });
});

it("offers no link editor and sends no links where the section takes none", async () => {
  const onCreate = vi.fn();
  renderSection({ section: EXTENDED, onCreate });

  await userEvent.click(screen.getByRole("button", { name: /^add$/i }));
  expect(screen.queryByPlaceholderText("https://...")).not.toBeInTheDocument();
  await userEvent.type(
    screen.getByPlaceholderText("Episode(s), e.g. ep 3"),
    "ep 12",
  );
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(onCreate).toHaveBeenCalledWith({
    section: "extended_episodes",
    locator: "ep 12",
    kind: null,
    content: null,
  });
});
