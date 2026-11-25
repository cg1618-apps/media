// InfoCard: every row of a card shares one column grid, as wide as the
// card's widest row, so a field sits under the field in the same column
// above it - an anime movie's Release Date TW under Release Type - rather
// than each row splitting the width evenly among its own fields.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import InfoCard from "./InfoCard";

const field = (label) => ({ label, value: "x" });

describe("InfoCard", () => {
  it("gives every row the widest row's column count", () => {
    render(
      <InfoCard
        title="Information"
        fields={[
          [field("Release Status"), field("Release Type"), field("Runtime")],
          [field("Release Date JP"), field("Release Date TW")],
        ]}
      />,
    );
    const rowOf = (label) => screen.getByText(label).closest(".grid");
    const three = "repeat(3, minmax(0, 1fr))";
    expect(rowOf("Release Status").style.gridTemplateColumns).toBe(three);
    expect(rowOf("Release Date JP").style.gridTemplateColumns).toBe(three);
    // Second in its row, so it sits in the second column, under Release Type.
    const tw = screen.getByText("Release Date TW").parentElement;
    expect([...tw.parentElement.children].indexOf(tw)).toBe(1);
  });

  it("keeps a field given on its own as a full-width line", () => {
    render(
      <InfoCard
        title="Genres"
        fields={[[field("Genre (Main)"), field("Genre (Sub)")], field("Label")]}
      />,
    );
    expect(screen.getByText("Label").closest(".grid")).toBeNull();
    expect(screen.getByText("Genre (Main)").closest(".grid").style.gridTemplateColumns).toBe(
      "repeat(2, minmax(0, 1fr))",
    );
  });
});
