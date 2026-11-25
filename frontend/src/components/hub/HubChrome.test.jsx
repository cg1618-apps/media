// The hubs' hero cover: the cover and the rating stamp, with no spine strip.
// The admin strip: Edit at its left end, no caption, as on the media pages.
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { AdminStrip, HeroCover } from "./HubChrome";

describe("HeroCover", () => {
  it("draws the cover and the stamp, and no spine strip", () => {
    const { container } = render(<HeroCover cover={null} rating="S" done={1} total={4} pct={25} />);
    expect(screen.getByAltText("Cover")).toBeInTheDocument();
    expect(screen.getByText("1 / 4 · 25%")).toBeInTheDocument();
    expect(container.querySelector('[style*="vertical-rl"]')).toBeNull();
  });
});

describe("AdminStrip", () => {
  it("puts Edit in the strip's left-hand group and carries no Admin caption", () => {
    const { container } = render(
      <MemoryRouter>
        <AdminStrip editId="FR001" />
      </MemoryRouter>,
    );
    const edit = screen.getByRole("link", { name: "Edit" });
    expect(edit.getAttribute("href")).toBe("/modify?id=FR001");
    expect(screen.getByRole("group", { name: "Edit actions" })).toContainElement(edit);
    expect(screen.queryByRole("group", { name: "Status actions" })).toBeNull();
    expect(container.textContent).not.toMatch(/admin/i);
  });
});
