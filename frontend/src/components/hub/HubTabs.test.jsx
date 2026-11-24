// The hubs' underline tab bar. It scrolls sideways, and overflow-x turns
// overflow-y to auto as well, so a tab reaching even 1px below the bar drew a
// vertical scrollbar beside the tabs. The tabs must fit the bar: no negative
// bottom margin on a tab, the hairline drawn inside the bar, and the vertical
// axis clipped.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { HubTabs } from "./HubChrome";

const GROUPS = [
  { label: "Members", tabs: ["Franchises"], counted: true },
  { label: "Extras", tabs: ["Watch order", "Notes"] },
];

function mount(activeTab = "Franchises") {
  return render(
    <HubTabs groups={GROUPS} activeTab={activeTab} onSelect={vi.fn()} getCount={() => 7} />
  );
}

describe("HubTabs", () => {
  it("never scrolls vertically", () => {
    const { container } = mount();
    const bar = container.firstChild;
    expect(bar.className).toMatch(/\boverflow-x-auto\b/);
    expect(bar.className).toMatch(/\boverflow-y-hidden\b/);
  });

  it("keeps every tab inside the bar, so nothing overflows it", () => {
    mount();
    for (const name of ["Franchises 7", "Watch order", "Notes"]) {
      expect(screen.getByRole("button", { name }).className).not.toMatch(/-mb-px/);
    }
  });

  it("draws the hairline inside the bar, under the active tab's underline", () => {
    const { container } = mount();
    const bar = container.firstChild;
    expect(bar.className).not.toMatch(/\bborder-b\b/);
    expect(bar.className).toMatch(/shadow-\[inset_0_-1px_0_var\(--color-border\)\]/);
    expect(screen.getByRole("button", { name: "Franchises 7" }).className).toMatch(/border-brand/);
  });
});
