// CastSection's tiers: collapsed shows every Main character, expanding adds
// Core, and the full cast - every role - opens in a dialog.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

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

it("links a character row to the character's page, with no identity of", () => {
  mount([casting("Kudo Shinichi", "Main", 6)]);
  expect(screen.getByRole("link", { name: "Kudo Shinichi" })).toHaveAttribute(
    "href",
    "/character/7/kudo-shinichi",
  );
  expect(screen.queryByText(/identity of/)).toBeNull();
});

it("links a row cast as an identity to the identity's page", () => {
  mount([
    {
      ...casting("Kudo Shinichi", "Main", 6),
      identity_id: "i1",
      identity_public_id: 3,
      identity_name: "Edogawa Conan",
    },
  ]);
  expect(screen.getByRole("link", { name: "Edogawa Conan" })).toHaveAttribute(
    "href",
    "/identity/3/edogawa-conan",
  );
  // The character is named in words and as its own link, not in bare brackets.
  expect(screen.getByText(/identity of/)).toBeInTheDocument();
  expect(screen.queryByText("(Kudo Shinichi)")).toBeNull();
  expect(screen.getByRole("link", { name: "Kudo Shinichi" })).toHaveAttribute(
    "href",
    "/character/7/kudo-shinichi",
  );
});

it("says identity of in the full-cast dialog too", () => {
  mount([
    casting("Hero", "Main", 0),
    {
      ...casting("Kudo Shinichi", "Supporting", 6),
      identity_id: "i1",
      identity_public_id: 3,
      identity_name: "Edogawa Conan",
    },
  ]);
  fireEvent.click(screen.getByText(/Show full cast/));
  const dialog = screen.getByRole("dialog", { name: "Full cast" });
  expect(within(dialog).getByText(/identity of/)).toBeInTheDocument();
  expect(within(dialog).getByRole("link", { name: "Kudo Shinichi" })).toHaveAttribute(
    "href",
    "/character/7/kudo-shinichi",
  );
});

it("falls back to the character's page when the identity row has no public_id", () => {
  mount([
    {
      ...casting("Kudo Shinichi", "Main", 6),
      identity_id: "i1",
      identity_name: "Edogawa Conan",
    },
  ]);
  expect(screen.getByRole("link", { name: "Edogawa Conan" })).toHaveAttribute(
    "href",
    "/character/7/kudo-shinichi",
  );
});

// Identity rows are folded away by default: Kudo Shinichi is in the cast once,
// and Edogawa Conan is a second name for the same person, not a second
// character. An identity whose character has no main row here is the only way
// that character appears, so it is never hidden.
describe("identity rows", () => {
  const identity = (name, role, position, of, extra = {}) => ({
    ...casting(name, role, position),
    system_id: `cc-${name}`,
    character_id: `c-${of}`,
    character_name: of,
    identity_id: `i-${name}`,
    identity_public_id: position + 100,
    identity_name: name,
    ...extra,
  });
  const headlines = (scope = screen) =>
    // Each row's headline link; the "identity of <character>" link beside
    // an identity's headline is not one.
    scope
      .queryAllByRole("link")
      .filter((link) => !link.parentElement.textContent.startsWith("identity of"))
      .map((link) => link.textContent);

  const CAST_WITH_IDENTITIES = [
    casting("Shinichi", "Main", 0),
    identity("Conan", "Main", 1, "Shinichi"),
    casting("Ran", "Main", 2),
    casting("Kogoro", "Core", 3),
    identity("Kogoro Asleep", "Core", 4, "Kogoro"),
    // Kaito has no main row here: his identity is how he appears at all.
    identity("Kid", "Main", 5, "Kaito"),
    casting("Megure", "Supporting", 6),
  ];

  it("hides identity rows by default and counts them on the toggle", () => {
    mount(CAST_WITH_IDENTITIES);
    expect(headlines()).toEqual(["Shinichi", "Ran", "Kid"]);
    expect(screen.getByRole("button", { name: "Show identities (2)" })).toBeInTheDocument();
  });

  it("keeps an identity whose character has no main row, and does not count it", () => {
    mount([casting("Ran", "Main", 0), identity("Kid", "Main", 1, "Kaito")]);
    expect(headlines()).toEqual(["Ran", "Kid"]);
    expect(screen.queryByRole("button", { name: /identities/ })).toBeNull();
  });

  it("shows the identities on the toggle, and flips its label", () => {
    mount(CAST_WITH_IDENTITIES);
    fireEvent.click(screen.getByRole("button", { name: "Show identities (2)" }));
    expect(headlines()).toEqual(["Shinichi", "Conan", "Ran", "Kid"]);
    fireEvent.click(screen.getByRole("button", { name: "Hide identities" }));
    expect(headlines()).toEqual(["Shinichi", "Ran", "Kid"]);
  });

  it("counts the core and full cast over the rows shown", () => {
    mount(CAST_WITH_IDENTITIES);
    // Hidden: Core is Kogoro alone, the full cast five.
    expect(screen.getByText("Show core cast (+1)")).toBeInTheDocument();
    expect(screen.getByText("Show full cast (5)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show identities (2)" }));
    expect(screen.getByText("Show core cast (+2)")).toBeInTheDocument();
    expect(screen.getByText("Show full cast (7)")).toBeInTheDocument();
  });

  it("applies the same toggle in the full-cast dialog, and flips it there", () => {
    mount(CAST_WITH_IDENTITIES);
    fireEvent.click(screen.getByText("Show full cast (5)"));
    const dialog = screen.getByRole("dialog", { name: "Full cast" });
    expect(headlines(within(dialog))).toEqual(["Shinichi", "Ran", "Kid", "Kogoro", "Megure"]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Show identities (2)" }));
    expect(headlines(within(dialog))).toEqual([
      "Shinichi", "Conan", "Ran", "Kid", "Kogoro", "Kogoro Asleep", "Megure",
    ]);
    expect(within(dialog).getByRole("button", { name: "Hide identities" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByText("Close"));
    // One piece of state: the slip behind it shows them too.
    expect(headlines()).toEqual(["Shinichi", "Conan", "Ran", "Kid"]);
  });

  it("starts from Core when the only Main rows are hidden identities", () => {
    mount([
      casting("Kogoro", "Core", 0),
      identity("Sleeping Kogoro", "Main", 1, "Kogoro"),
      casting("Megure", "Supporting", 2),
    ]);
    expect(headlines()).toEqual(["Kogoro"]);
  });
});

// Dashed means identity across the app: the cast editor draws an identity
// row dashed, and so does the slip - its thumbnail and an "Identity" tag.
describe("identity rows look like identities", () => {
  const conanOnly = {
    ...casting("Kudo Shinichi", "Main", 0),
    identity_id: "i1",
    identity_public_id: 3,
    identity_name: "Edogawa Conan",
  };
  const rowOf = (name) => screen.getByRole("link", { name }).closest("[data-cast-row]");

  it("tags an identity row and frames its thumbnail dashed", () => {
    mount([casting("Ran", "Main", 1), conanOnly]);
    const conan = rowOf("Edogawa Conan");
    expect(within(conan).getByText("Identity")).toBeInTheDocument();
    expect(conan.querySelector("[data-identity-thumb]")).not.toBeNull();
  });

  it("leaves a main row untagged and its thumbnail solid", () => {
    mount([casting("Ran", "Main", 1), conanOnly]);
    const ran = rowOf("Ran");
    expect(within(ran).queryByText("Identity")).toBeNull();
    expect(ran.querySelector("[data-identity-thumb]")).toBeNull();
  });

  it("marks identity rows the same way in the full-cast dialog", () => {
    mount([
      casting("Ran", "Main", 0),
      casting("Megure", "Supporting", 1),
      { ...conanOnly, role: "Supporting", position: 2 },
    ]);
    fireEvent.click(screen.getByText(/Show full cast/));
    const dialog = screen.getByRole("dialog", { name: "Full cast" });
    const conan = within(dialog).getByRole("link", { name: "Edogawa Conan" }).closest("[data-cast-row]");
    expect(within(conan).getByText("Identity")).toBeInTheDocument();
    expect(conan.querySelector("[data-identity-thumb]")).not.toBeNull();
  });
});
