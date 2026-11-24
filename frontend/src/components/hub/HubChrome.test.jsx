// The hubs' hero cover: the cover and the rating stamp, with no spine strip.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HeroCover } from "./HubChrome";

describe("HeroCover", () => {
  it("draws the cover and the stamp, and no spine strip", () => {
    const { container } = render(<HeroCover cover={null} rating="S" done={1} total={4} pct={25} />);
    expect(screen.getByAltText("Cover")).toBeInTheDocument();
    expect(screen.getByText("1 / 4 · 25%")).toBeInTheDocument();
    expect(container.querySelector('[style*="vertical-rl"]')).toBeNull();
  });
});
