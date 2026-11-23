// Frontend: the Button primitive is a plain button unless it says otherwise.
//
// A <button> with no type submits its form, and Enter in any field of a form
// "clicks" the form's first submit button. So an untyped action Button placed
// above the form's own Save - the person form's gallery Upload, which opens
// a file dialog - ran on every Enter. A Button must ask for type="submit".
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./primitives";

describe("Button", () => {
  it("is type=button by default, and keeps an explicit type", () => {
    render(
      <>
        <Button>Upload</Button>
        <Button type="submit">Save</Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "Upload" })).toHaveAttribute("type", "button");
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("type", "submit");
  });

  it("is not what Enter in a form's field submits through", () => {
    const upload = vi.fn();
    const submit = vi.fn((e) => e.preventDefault());
    render(
      <form onSubmit={submit}>
        <input aria-label="Name" />
        <Button onClick={upload}>Upload</Button>
        <button type="submit">Save</button>
      </form>,
    );
    // jsdom does not run implicit submission on Enter, so the form's default
    // button is resolved the way the browser resolves it: the first submit
    // button in tree order.
    const defaultButton = screen
      .getAllByRole("button")
      .find((b) => b.type === "submit");
    fireEvent.click(defaultButton);
    expect(upload).not.toHaveBeenCalled();
    expect(submit).toHaveBeenCalledTimes(1);
  });
});
