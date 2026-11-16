// Frontend: the contents column scrolls on its own and follows the page.
//
// A detail page with every note card lists more rows than a screen holds, so
// the column is capped to the space under the nav and scrolls inside itself,
// and the current row is kept in view by moving the column's scroll - never
// the page's. jsdom has no layout, so the geometry is given by hand.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import TableOfContents, { keepInView } from "./TableOfContents";

const list = (scrollTop, clientHeight = 300) => ({ offsetTop: 0, scrollTop, clientHeight });
const row = (offsetTop, offsetHeight = 24) => ({ offsetTop, offsetHeight });

describe("keepInView", () => {
  it("scrolls down to a row below the visible part, with a margin", () => {
    const l = list(0);
    keepInView(l, row(600));
    expect(l.scrollTop).toBe(600 + 24 + 32 - 300);
  });

  it("scrolls up to a row above the visible part, with a margin", () => {
    const l = list(500);
    keepInView(l, row(100));
    expect(l.scrollTop).toBe(100 - 32);
  });

  it("leaves the list alone while the row is already in view", () => {
    const l = list(100);
    keepInView(l, row(200));
    expect(l.scrollTop).toBe(100);
  });
});

describe("TableOfContents", () => {
  const ITEMS = Array.from({ length: 30 }, (_, i) => ({ id: `s${i}`, label: `Section ${i}` }));

  it("is capped to the space under the nav and scrolls inside itself", () => {
    render(<TableOfContents items={ITEMS} activeId="s0" />);
    const nav = screen.getByRole("navigation", { name: "Contents" });
    expect(nav.className).toContain("sticky");
    expect(nav.className).toContain("max-h-[calc(100vh-var(--nav-h)-2rem)]");
    expect(nav.className).toContain("overflow-y-auto");
    // Every row is in the list, however far down the page.
    expect(screen.getByRole("button", { name: "Section 29" })).toBeInTheDocument();
  });

  it("moves its own scroll, not the page's, when the current row changes", () => {
    const pageScroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const { rerender } = render(<TableOfContents items={ITEMS} activeId="s0" />);
    const nav = screen.getByRole("navigation", { name: "Contents" });
    Object.defineProperty(nav, "clientHeight", { value: 300, configurable: true });
    const last = screen.getByRole("button", { name: "Section 29" });
    Object.defineProperty(last, "offsetTop", { value: 900, configurable: true });
    Object.defineProperty(last, "offsetHeight", { value: 24, configurable: true });

    rerender(<TableOfContents items={ITEMS} activeId="s29" />);

    expect(nav.scrollTop).toBe(900 + 24 + 32 - 300);
    expect(pageScroll).not.toHaveBeenCalled();
    pageScroll.mockRestore();
  });
});
