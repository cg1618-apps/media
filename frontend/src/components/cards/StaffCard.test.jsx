// The person, studio and publisher cards carry the viewer's own rating as the
// same stamp the media, franchise and collection cards draw, and draw nothing
// for an unrated entity.
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { PersonCard, PublisherCard, StudioCard } from "./StaffCard";

function mount(card) {
  return render(<MemoryRouter>{card}</MemoryRouter>);
}

describe("StaffCard rating stamp", () => {
  it.each([
    ["person", (e) => <PersonCard person={e} />],
    ["studio", (e) => <StudioCard studio={e} />],
    ["publisher", (e) => <PublisherCard publisher={e} />],
  ])("draws my_rating on a %s card", (_, card) => {
    mount(card({ public_id: "x1", display_name: "Rated", my_rating: "A+" }));
    expect(screen.getByLabelText("Rating A+")).toHaveTextContent("A+");
  });

  it("draws no stamp for an unrated entity", () => {
    mount(<PersonCard person={{ public_id: "x2", display_name: "Unrated", my_rating: null }} />);
    expect(screen.queryByLabelText(/^Rating /)).not.toBeInTheDocument();
  });
});

// The studio and publisher cards draw the server-resolved display logo (the
// own logo, else a visible credited entry's cover) and fall back to logo_file
// for a payload that does not carry it.
describe("StaffCard company logo", () => {
  const cards = [
    ["studio", (e) => <StudioCard studio={e} />],
    ["publisher", (e) => <PublisherCard publisher={e} />],
  ];

  it.each(cards)("draws a %s's display logo with its focus", (_, card) => {
    mount(
      card({
        public_id: "c1",
        display_name: "Fallback",
        logo_file: null,
        logo_focus: null,
        display_logo_file: "library/cover.jpg",
        display_logo_focus: "30% 40%",
      }),
    );
    const img = screen.getByAltText("Logo");
    expect(img).toHaveAttribute("src", "/static/library/thumbs/cover.jpg");
    expect(img.style.objectPosition).toBe("30% 40%");
  });

  it.each(cards)("falls back to a %s's logo_file without display_logo", (_, card) => {
    mount(
      card({
        public_id: "c2",
        display_name: "Own",
        logo_file: "library/own.png",
        logo_focus: "10% 20%",
      }),
    );
    const img = screen.getByAltText("Logo");
    expect(img).toHaveAttribute("src", "/static/library/thumbs/own.png");
    expect(img.style.objectPosition).toBe("10% 20%");
  });
});

// No grid card names its type in a vertical spine down the cover's left edge.
describe("StaffCard spine", () => {
  it.each([
    ["person", (e) => <PersonCard person={e} />],
    ["studio", (e) => <StudioCard studio={e} />],
    ["publisher", (e) => <PublisherCard publisher={e} />],
  ])("draws no type spine on a %s card", (_, card) => {
    const { container } = mount(card({ public_id: "x3", display_name: "Spineless" }));
    expect(container.querySelector('[style*="vertical-rl"]')).toBeNull();
  });
});
