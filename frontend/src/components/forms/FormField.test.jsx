// Frontend: the shared form primitives. SectionHeader names itself in
// `data-form-section`, which is how the entry-form tests read section order.
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SectionHeader } from "./FormField";

describe("SectionHeader", () => {
  it("carries its title in data-form-section", () => {
    const { container } = render(
      <>
        <SectionHeader icon="fa-tag" title="Titles & Naming" />
        <SectionHeader icon="fa-star" title="Scores" />
      </>,
    );
    expect(
      [...container.querySelectorAll("[data-form-section]")].map((h) => h.dataset.formSection),
    ).toEqual(["Titles & Naming", "Scores"]);
    expect(container.textContent).toBe("Titles & NamingScores");
  });
});
