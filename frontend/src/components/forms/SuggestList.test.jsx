// SuggestList's placement: "room below" is the visible area, not the window.
// An iOS on-screen keyboard covers the bottom of the page without shrinking
// window.innerHeight, so only the visual viewport says the list would open
// behind it.
import { useRef } from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SuggestItem, SuggestList } from "./SuggestList";

function Anchored() {
  const anchor = useRef(null);
  return (
    <>
      <input ref={anchor} aria-label="Anchor" />
      <SuggestList anchorRef={anchor} label="Suggestions">
        <SuggestItem>One</SuggestItem>
      </SuggestList>
    </>
  );
}

// The anchor sits 400px down a 900px-tall window: plenty of room below it.
function placeAnchor() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    top: 400,
    bottom: 440,
    left: 16,
    width: 300,
    height: 40,
    right: 316,
  });
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(900);
}

afterEach(() => {
  vi.restoreAllMocks();
  delete window.visualViewport;
});

describe("SuggestList placement", () => {
  it("opens below the anchor when the window has room", () => {
    placeAnchor();
    render(<Anchored />);
    const list = screen.getByRole("listbox", { name: "Suggestions" });
    expect(list.style.top).toBe("442px");
    expect(list.style.bottom).toBe("");
  });

  it("flips above when a keyboard covers the room below", () => {
    placeAnchor();
    // A keyboard taking the bottom 420px: 480px of the window is visible.
    window.visualViewport = Object.assign(new EventTarget(), { height: 480, offsetTop: 0 });
    render(<Anchored />);
    const list = screen.getByRole("listbox", { name: "Suggestions" });
    expect(list.style.top).toBe("");
    expect(list.style.bottom).toBe(`${900 - 400 + 2}px`);
  });
});
