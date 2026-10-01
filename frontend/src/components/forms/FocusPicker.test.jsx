// Frontend: the focal-point modal.
//
// The value it hands back is what the API stores and CSS reads as
// object-position, so these pin the arithmetic (a click at a point of the
// image gives that point's percentages), the keyboard nudge, and that the
// centre comes back as null rather than "50% 50%".
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import FocusPicker from "./FocusPicker";

// jsdom has no PointerEvent, so fireEvent.pointerDown would build a bare Event
// with no coordinates. A MouseEvent carries clientX/clientY, which is all the
// picker reads.
if (typeof window.PointerEvent === "undefined") {
  window.PointerEvent = class PointerEvent extends MouseEvent {
    constructor(type, init = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  };
}

function renderPicker(props = {}) {
  const onDone = vi.fn();
  const onCancel = vi.fn();
  render(
    <FocusPicker
      src="/static/library/abc.jpg"
      focus={null}
      onDone={onDone}
      onCancel={onCancel}
      {...props}
    />,
  );
  // jsdom lays nothing out, so give the image frame a size to click inside.
  const frame = screen.getByTestId("focus-frame");
  frame.getBoundingClientRect = () => ({
    left: 100,
    top: 50,
    width: 200,
    height: 400,
    right: 300,
    bottom: 450,
  });
  return { onDone, onCancel, frame };
}

const marker = () => screen.getByRole("button", { name: /focal point/i });
const done = () => userEvent.click(screen.getByRole("button", { name: "Done" }));

describe("FocusPicker", () => {
  it("starts on the stored focus and shows the whole image", () => {
    renderPicker({ focus: "30% 20%" });

    expect(marker()).toHaveAccessibleName("Focal point, 30% across, 20% down");
    expect(screen.getByAltText("Whole image")).not.toHaveClass("object-cover");
  });

  it("previews the crop in a portrait card and a square at the chosen point", () => {
    renderPicker({ focus: "30% 20%" });

    for (const alt of ["Portrait preview", "Square preview"]) {
      expect(screen.getByAltText(alt)).toHaveStyle({
        objectPosition: "30% 20%",
      });
    }
  });

  it("moves the point to where the image is clicked", async () => {
    const { onDone, frame } = renderPicker();

    // 50px into a 200px-wide frame, 100px into a 400px-tall one.
    fireEvent.pointerDown(frame, { clientX: 150, clientY: 150, button: 0 });
    fireEvent.pointerUp(frame);
    await done();

    expect(onDone).toHaveBeenCalledWith("25% 25%");
  });

  it("follows a drag and clamps it to the image", async () => {
    const { onDone, frame } = renderPicker();

    fireEvent.pointerDown(frame, { clientX: 150, clientY: 150, button: 0 });
    fireEvent.pointerMove(frame, { clientX: 400, clientY: 10 });
    fireEvent.pointerUp(frame);
    await done();

    expect(onDone).toHaveBeenCalledWith("100% 0%");
  });

  it("nudges by 1% with an arrow key and 10% with Shift", async () => {
    const { onDone } = renderPicker({ focus: "40% 40%" });

    marker().focus();
    await userEvent.keyboard("{ArrowRight}{ArrowDown}{Shift>}{ArrowUp}{/Shift}");
    await done();

    expect(onDone).toHaveBeenCalledWith("41% 31%");
  });

  it("hands back null when reset to the centre", async () => {
    const { onDone } = renderPicker({ focus: "10% 90%" });

    await userEvent.click(screen.getByRole("button", { name: "Reset to centre" }));
    await done();

    expect(onDone).toHaveBeenCalledWith(null);
  });

  it("hands back null when Done is pressed on the centre", async () => {
    const { onDone } = renderPicker({ focus: null });

    await done();

    expect(onDone).toHaveBeenCalledWith(null);
  });

  it("cancels without calling back", async () => {
    const { onDone, onCancel } = renderPicker({ focus: "10% 90%" });

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });
});
