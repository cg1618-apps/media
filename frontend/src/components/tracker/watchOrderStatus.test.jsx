// A step's list status on the watch order guide: drawn at the far right of
// the row, only for a viewer with a list, and tinted only on the standalone
// page (`colourCoded`).
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import WatchOrderGuide from "./WatchOrderGuide";

const auth = { permissions: [] };
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ has: (p) => auth.permissions.includes(p) }),
}));

const step = (id, extra = {}) => ({
  system_id: id,
  position: Number(id.slice(1)),
  section_id: null,
  media_type: "anime",
  entry_id: `e-${id}`,
  missing: false,
  display_name: `Step ${id}`,
  importance: "Normal",
  status: null,
  ...extra,
});

const LIST = {
  system_id: "L1",
  sections: [],
  items: [
    step("s1", { status: "Completed (解說)", importance: "Essential" }),
    step("s2", { status: "Paused", importance: "Recommended" }),
    step("s3", { status: null, importance: "Optional" }),
    step("s4", { status: "Rewatching" }),
  ],
};

const draw = (props = {}) =>
  render(
    <MemoryRouter>
      <WatchOrderGuide list={LIST} roomy {...props} />
    </MemoryRouter>
  );

describe("watch order step status", () => {
  beforeEach(() => {
    auth.permissions = ["self.list"];
  });

  it("draws no status for a viewer without a list", () => {
    // The statuses are on the payload, so this proves the gate hid them,
    // not that there was nothing to draw.
    auth.permissions = [];
    draw({ colourCoded: true });
    expect(screen.queryAllByTestId("step-status")).toHaveLength(0);
    expect(screen.queryByText("Paused")).toBeNull();
  });

  it("puts the status last in the row, and none for a step not on the list", () => {
    draw({ colourCoded: true });
    const chips = screen.getAllByTestId("step-status");
    expect(chips.map((c) => c.textContent)).toEqual([
      "Completed (解說)",
      "Paused",
      "Rewatching",
    ]);
    for (const chip of chips) {
      expect(chip.parentElement.lastElementChild).toBe(chip);
    }
  });

  it("tints the status and importance on the standalone page", () => {
    draw({ colourCoded: true });
    expect(screen.getByText("Completed (解說)").className).toContain("text-state-success");
    expect(screen.getByText("Paused").className).toContain("text-state-info");
    // Unknown to this build: keeps the ink chip rather than going missing.
    expect(screen.getByText("Rewatching").className).toContain("text-text-muted");
    expect(screen.getByText("Essential").className).toContain("bg-brand ");
    expect(screen.getByText("Recommended").className).toContain("bg-brand-soft");
    expect(screen.getByText("Optional").className).toContain("text-text-muted");
  });

  it("keeps ink chips in the franchise tab", () => {
    draw();
    expect(screen.getByText("Completed (解說)").className).not.toContain("state-");
    expect(screen.getByText("Essential").className).not.toContain("bg-brand");
  });
});
