// A typed progress count saves on blur or Enter, once, and never per
// keystroke; Escape saves nothing. The stepper's − / + still save at once.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ProgressInput from "./ProgressInput";
import { EpisodeStepper } from "./MyTrackerCard";

/** Types `text` one keystroke at a time, as a person would. */
function typeInto(input, text) {
  let sofar = "";
  for (const ch of text) {
    sofar += ch;
    fireEvent.change(input, { target: { value: sofar } });
  }
}

function draw(props = {}) {
  const onCommit = vi.fn();
  render(<ProgressInput value={12} onCommit={onCommit} aria-label="Episodes" {...props} />);
  return { onCommit, input: screen.getByLabelText("Episodes") };
}

describe("ProgressInput", () => {
  it("saves 12 → 35 exactly once, on blur, not per keystroke", () => {
    const { onCommit, input } = draw();
    fireEvent.change(input, { target: { value: "" } });
    typeInto(input, "35");
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe("35");
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(35);
  });

  it("saves on Enter, and the blur that follows does not save again", () => {
    const { onCommit, input } = draw();
    input.focus();
    fireEvent.change(input, { target: { value: "35" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(35);
  });

  it("throws the draft away on Escape and shows the saved value", () => {
    const { onCommit, input } = draw();
    input.focus();
    typeInto(input, "35");
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe("12");
  });

  it("does not save a value that has not changed", () => {
    const { onCommit, input } = draw();
    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.blur(input);
    // Tabbing through without typing is no save either.
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("parses an emptied box as 0, as the steppers always have", () => {
    const { onCommit, input } = draw();
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(0);
  });

  it("keeps a decimal when asked to", () => {
    const { onCommit, input } = draw({ decimal: true });
    fireEvent.change(input, { target: { value: "3.5" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(3.5);
    expect(input).toHaveAttribute("inputmode", "decimal");
  });

  it("asks a phone for the numeric keyboard with a Done key", () => {
    const { input } = draw();
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAttribute("enterkeyhint", "done");
  });

  it("shows the saved value again when the caller refuses the commit", () => {
    // Over the total: the stepper's handler returns without saving, so the
    // value prop never moves and the draft must not linger.
    const { input } = draw({ onCommit: () => {} });
    fireEvent.change(input, { target: { value: "99" } });
    fireEvent.blur(input);
    expect(input.value).toBe("12");
  });
});

describe("EpisodeStepper", () => {
  const stepper = (onEpChange) =>
    render(
      <EpisodeStepper epFin={12} epTotal={50} canTrack onEpChange={onEpChange} />
    );

  it("saves a typed count once, on blur", () => {
    const onEpChange = vi.fn();
    stepper(onEpChange);
    const input = screen.getByLabelText("Episodes finished");
    fireEvent.change(input, { target: { value: "3" } });
    fireEvent.change(input, { target: { value: "35" } });
    expect(onEpChange).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onEpChange).toHaveBeenCalledTimes(1);
    expect(onEpChange).toHaveBeenCalledWith(35);
  });

  it("refuses a count over the total", () => {
    const onEpChange = vi.fn();
    stepper(onEpChange);
    const input = screen.getByLabelText("Episodes finished");
    fireEvent.change(input, { target: { value: "51" } });
    fireEvent.blur(input);
    expect(onEpChange).not.toHaveBeenCalled();
  });

  it("still saves at once from the − and + buttons", () => {
    const onEpChange = vi.fn();
    stepper(onEpChange);
    fireEvent.click(screen.getByLabelText("Next episode"));
    expect(onEpChange).toHaveBeenLastCalledWith(13);
    fireEvent.click(screen.getByLabelText("Previous episode"));
    expect(onEpChange).toHaveBeenLastCalledWith(11);
    expect(onEpChange).toHaveBeenCalledTimes(2);
  });
});
