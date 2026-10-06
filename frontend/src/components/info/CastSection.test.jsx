// CastSection's tiers: collapsed shows every Main character, expanding adds
// Core, and the full cast - every role - opens in a dialog.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";

import CastSection from "./CastSection";

function casting(name, role, position, voices = []) {
  return {
    system_id: `cc-${name}`,
    character_id: `c-${name}`,
    character_public_id: position + 1,
    character_name: name,
    voices,
    role,
    position,
    photo_file: null,
    remark: null,
  };
}

it("shows the resolved display photo, not the row's own", () => {
  mount([
    {
      ...casting("Hero", "Main", 0),
      photo_file: null,
      display_photo_file: "characters/hero.jpg",
    },
  ]);
  expect(document.querySelector("img").getAttribute("src")).toContain(
    "characters/hero.jpg",
  );
});

const CAST = [
  casting("Hero", "Main", 0),
  casting("Heroine", "Main", 1),
  casting("Rival", "Core", 2),
  casting("Teacher", "Supporting", 3),
  casting("Shopkeeper", null, 4),
];

function mount(cast) {
  render(
    <MemoryRouter>
      <CastSection cast={cast} />
    </MemoryRouter>,
  );
}

const shownNames = () =>
  screen.queryAllByRole("link").map((link) => link.textContent);

it("shows every Main character, and only them, collapsed", () => {
  mount(CAST);
  expect(shownNames()).toEqual(["Hero", "Heroine"]);
});

it("adds the Core characters when expanded, and collapses back", () => {
  mount(CAST);
  fireEvent.click(screen.getByText("Show core cast (+1)"));
  expect(shownNames()).toEqual(["Hero", "Heroine", "Rival"]);
  fireEvent.click(screen.getByText("Show main cast only"));
  expect(shownNames()).toEqual(["Hero", "Heroine"]);
});

it("lists the whole cast in a dialog", () => {
  mount(CAST);
  fireEvent.click(screen.getByText("Show full cast (5)"));
  const dialog = screen.getByRole("dialog", { name: "Full cast" });
  expect(
    within(dialog).getAllByRole("link").map((link) => link.textContent),
  ).toEqual(["Hero", "Heroine", "Rival", "Teacher", "Shopkeeper"]);
  fireEvent.click(within(dialog).getByText("Close"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("starts from Core when the cast has no Main character", () => {
  mount([casting("Rival", "Core", 0), casting("Teacher", "Supporting", 1)]);
  expect(shownNames()).toEqual(["Rival"]);
  expect(screen.queryByText(/Show core cast/)).not.toBeInTheDocument();
});

it("shows a cast with no Main or Core character whole, with nothing to expand", () => {
  mount([casting("Teacher", "Supporting", 0), casting("Shopkeeper", null, 1)]);
  expect(shownNames()).toEqual(["Teacher", "Shopkeeper"]);
  expect(screen.queryByText(/Show full cast/)).not.toBeInTheDocument();
});

it("names every seiyuu of a character, with their remarks", () => {
  mount([
    casting("Hero", "Main", 0, [
      { person_id: "p1", person_public_id: 1, person_name: "Adult Voice", remark: null },
      { person_id: "p2", person_public_id: 2, person_name: "Child Voice", remark: "child" },
    ]),
  ]);
  expect(shownNames()).toEqual(["Hero", "Adult Voice", "Child Voice"]);
  expect(screen.getByText("(child)")).toBeInTheDocument();
});
