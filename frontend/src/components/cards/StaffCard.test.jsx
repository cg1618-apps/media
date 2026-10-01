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
