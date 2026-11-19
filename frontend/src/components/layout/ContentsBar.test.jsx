// Frontend: the phone contents bar - a row of chips that jumps to a section.
//
// Below xl the right-hand contents column is not drawn, so the page carries
// this bar at its top instead. It lists the main rows only (a level 2 sub-row
// would repeat "Active" three times), marks the main row the reader is in -
// a sub-row's parent when the scroll-spy reports a sub-row - and scrolls to
// a chip's anchor when it is pressed. jsdom has no layout, so the geometry is
// given by hand.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ContentsBar, { activeMainRow, keepChipInView } from "./ContentsBar";

const ITEMS = [
  { id: "announcements", label: "Announcements", level: 1 },
  { id: "watching", label: "Watching", level: 1 },
  { id: "watching-active", label: "Active", level: 2 },
  { id: "reading", label: "Reading", level: 1 },
  { id: "reading-active", label: "Active", level: 2 },
];

const bar = () => screen.getByRole("navigation", { name: "Sections" });
const chips = () => within(bar()).getAllByRole("button");

describe("activeMainRow", () => {
  it("is the active id itself when that is a main row", () => {
    expect(activeMainRow(ITEMS, "watching")).toBe("watching");
  });

  it("is the sub-row's parent when the active id is a sub-row", () => {
    expect(activeMainRow(ITEMS, "reading-active")).toBe("reading");
  });

  it("is nothing when nothing is active", () => {
    expect(activeMainRow(ITEMS, null)).toBeNull();
  });
});

describe("keepChipInView", () => {
  const list = (scrollLeft, clientWidth = 300) => ({ offsetLeft: 0, scrollLeft, clientWidth });
  const chip = (offsetLeft, offsetWidth = 80) => ({ offsetLeft, offsetWidth });

  it("scrolls right to a chip past the visible part, with a margin", () => {
    const l = list(0);
    keepChipInView(l, chip(500));
    expect(l.scrollLeft).toBe(500 + 80 + 16 - 300);
  });

  it("scrolls left to a chip before the visible part, with a margin", () => {
    const l = list(400);
    keepChipInView(l, chip(100));
    expect(l.scrollLeft).toBe(100 - 16);
  });

  it("leaves the row alone while the chip is already in view", () => {
    const l = list(100);
    keepChipInView(l, chip(150));
    expect(l.scrollLeft).toBe(100);
  });
});

describe("ContentsBar", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
  });

  it("lists the main rows only, in order", () => {
    render(<ContentsBar items={ITEMS} activeId="announcements" />);
    expect(chips().map((c) => c.textContent)).toEqual([
      "Announcements",
      "Watching",
      "Reading",
    ]);
  });

  it("marks the main row of the section in view", () => {
    render(<ContentsBar items={ITEMS} activeId="watching-active" />);
    const current = within(bar()).getByRole("button", { current: "location" });
    expect(current).toHaveTextContent("Watching");
  });

  it("scrolls to a chip's anchor, below whatever covers it", () => {
    const el = document.createElement("section");
    el.id = "reading";
    el.getBoundingClientRect = () => ({ top: 900 });
    document.body.appendChild(el);
    render(<ContentsBar items={ITEMS} activeId="announcements" offsetFor={() => 100} />);
    fireEvent.click(within(bar()).getByRole("button", { name: "Reading" }));
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 800, behavior: "smooth" });
    el.remove();
  });

  it("is drawn below xl only, where the contents column is not", () => {
    render(<ContentsBar items={ITEMS} activeId="announcements" />);
    expect(bar().className).toMatch(/(^|\s)xl:hidden(\s|$)/);
  });

  it("pins under the nav when asked to", () => {
    render(<ContentsBar items={ITEMS} activeId="announcements" sticky />);
    expect(bar().className).toMatch(/sticky top-\[var\(--nav-h\)\]/);
  });

  it("scrolls sideways inside itself, never the page", () => {
    render(<ContentsBar items={ITEMS} activeId="announcements" />);
    expect(bar().className).toMatch(/overflow-x-auto/);
  });

  it("draws nothing with no rows", () => {
    render(<ContentsBar items={[]} activeId={null} />);
    expect(screen.queryByRole("navigation", { name: "Sections" })).toBeNull();
  });
});
