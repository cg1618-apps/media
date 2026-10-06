import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import AutoGrowTextarea from "./AutoGrowTextarea";

// jsdom does no layout, so scrollHeight is always 0. Stand in for the browser:
// 20 px per line of the textarea's current value.
const LINE = 20;
// A box-sizing: border-box height includes the border, which scrollHeight
// does not, so the component has to add it back.
const BORDER = 3;
const fit = (lines) => `${lines * LINE + 2 * BORDER}px`;
let original;
beforeEach(() => {
  original = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "scrollHeight");
  Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", {
    configurable: true,
    get() {
      return Math.max(1, this.value.split("\n").length) * LINE;
    },
  });
});
afterEach(() => {
  if (original) Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", original);
  else delete HTMLTextAreaElement.prototype.scrollHeight;
});

function Harness({ initial = "" }) {
  const [value, setValue] = useState(initial);
  return (
    <AutoGrowTextarea
      aria-label="Note"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      className="border"
      style={{ borderStyle: "solid", borderWidth: `${BORDER}px` }}
    />
  );
}

const box = () => screen.getByLabelText("Note");

describe("AutoGrowTextarea", () => {
  it("fits its height to a value it opens with", () => {
    render(<Harness initial={"one\ntwo\nthree\nfour"} />);
    expect(box().style.height).toBe(fit(4));
  });

  it("grows as lines are typed and shrinks as they are deleted", () => {
    render(<Harness initial="one" />);
    expect(box().style.height).toBe(fit(1));
    fireEvent.change(box(), { target: { value: "one\ntwo\nthree\nfour\nfive" } });
    expect(box().style.height).toBe(fit(5));
    fireEvent.change(box(), { target: { value: "one\ntwo" } });
    expect(box().style.height).toBe(fit(2));
  });

  it("starts two rows high, cannot be dragged, and caps its height so a long note scrolls", () => {
    render(<Harness />);
    expect(box()).toHaveAttribute("rows", "2");
    expect(box().className).toContain("border");
    expect(box().className).toContain("resize-none");
    expect(box().className).toContain("max-h-80");
    expect(box().className).toContain("overflow-y-auto");
  });
});
