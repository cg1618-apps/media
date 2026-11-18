// Frontend: a personal section's title carries a circled P; a catalogue
// section's does not. Both drawn by the same shape, so the difference is the
// section's scope and nothing else.
import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";

import TextLinksSection from "./TextLinksSection";
import TextSection from "./TextSection";

const base = {
  shape: "text_links",
  locator_placeholder: null,
  locator_required: false,
  desc_required: false,
  link_pairs: false,
  fields: [],
};

const renderLinks = (section) =>
  render(
    <TextLinksSection
      section={section}
      notes={[]}
      canWrite
      onCreate={() => {}}
      onUpdate={() => {}}
      onDelete={() => {}}
    />,
  );

it("marks a personal section's title with the P badge", () => {
  renderLinks({ ...base, key: "advantages", label: "優點 Advantages", scope: "personal" });
  const title = screen.getByRole("heading", { name: /優點 Advantages/ });
  const badge = within(title).getByRole("img", { name: "Personal" });
  expect(badge).toHaveTextContent("P");
  expect(badge).toHaveAttribute("title", expect.stringMatching(/only you/));
});

it("leaves a catalogue section's title unmarked (the mirror)", () => {
  renderLinks({ ...base, key: "trivia", label: "小知識 Trivia", scope: "catalog" });
  const title = screen.getByRole("heading", { name: /小知識 Trivia/ });
  expect(within(title).queryByRole("img", { name: "Personal" })).toBeNull();
});

it("marks a singleton box too", () => {
  render(
    <TextSection
      section={{ key: "journal", shape: "text", label: "日誌 Journal", scope: "personal", singleton: true }}
      notes={[]}
      canWrite
      onCreate={() => {}}
      onUpdate={() => {}}
      onDelete={() => {}}
    />,
  );
  const title = screen.getByRole("heading", { name: /日誌 Journal/ });
  expect(within(title).getByRole("img", { name: "Personal" })).toBeInTheDocument();
});
