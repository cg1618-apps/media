// Frontend: the pill picker behind every tag field. Two props that read
// alike and mean different things: `limit` caps how many options the
// dropdown SHOWS, `max` caps how many values can be SELECTED. The anime
// Exclusive Source field once passed limit={1} meaning "one value", which
// hid every platform but the first.
import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import MultiSelect from "./MultiSelect";

const PLATFORMS = ["Disney+", "Netflix", "Amazon Prime Video", "Crunchyroll"];

function renderPicker(props) {
  const onChange = vi.fn();
  render(<MultiSelect options={PLATFORMS} value="" onChange={onChange} {...props} />);
  return onChange;
}

describe("MultiSelect", () => {
  it("shows every option on focus when limit is null", async () => {
    renderPicker({ limit: null, max: 1 });
    await userEvent.click(screen.getByRole("combobox"));
    for (const p of PLATFORMS) {
      expect(screen.getByRole("option", { name: p })).toBeInTheDocument();
    }
  });

  it("caps the shown options at limit", async () => {
    renderPicker({ limit: 2 });
    await userEvent.click(screen.getByRole("combobox"));
    expect(screen.getByRole("option", { name: "Disney+" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Netflix" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Crunchyroll" })).toBeNull();
  });

  it("replaces the held value rather than adding a second when max is reached", async () => {
    const onChange = renderPicker({ value: "Disney+", limit: null, max: 1 });
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(screen.getByRole("option", { name: "Netflix" }));
    expect(onChange).toHaveBeenLastCalledWith("Netflix");
  });

  it("adds without limit when max is not given", async () => {
    const onChange = renderPicker({ value: "Disney+", limit: null });
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(screen.getByRole("option", { name: "Netflix" }));
    expect(onChange).toHaveBeenLastCalledWith("Disney+, Netflix");
  });

  // Typing then Enter is the only way a value outside the vocabulary goes in
  // (an anime's Studio), and the field sits inside the page-wide Add / Modify
  // form, whose onSubmit saves the whole entry.
  describe("adding typed text inside a form", () => {
    function InForm({ onSubmit }) {
      const [value, setValue] = useState("");
      return (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <MultiSelect options={PLATFORMS} value={value} onChange={setValue} />
          <output data-testid="value">{value}</output>
          <button type="submit">Save</button>
        </form>
      );
    }

    it("adds on Enter and does not submit the form", async () => {
      const onSubmit = vi.fn();
      render(<InForm onSubmit={onSubmit} />);
      await userEvent.type(screen.getByRole("combobox"), "MAPPA{Enter}");
      expect(screen.getByTestId("value")).toHaveTextContent(/^MAPPA$/);
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("still submits the form on Enter in an empty field", async () => {
      const onSubmit = vi.fn();
      render(<InForm onSubmit={onSubmit} />);
      await userEvent.type(screen.getByRole("combobox"), "{Enter}");
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it("offers a tappable Add row for text no option equals", async () => {
      render(<InForm onSubmit={vi.fn()} />);
      await userEvent.type(screen.getByRole("combobox"), "Net");
      // A partial match keeps the add row: "Net" is not "Netflix".
      expect(screen.getByRole("option", { name: "Netflix" })).toBeInTheDocument();
      fireEvent.mouseDown(screen.getByRole("option", { name: 'Add "Net"' }));
      expect(screen.getByTestId("value")).toHaveTextContent(/^Net$/);
    });

    it("offers no Add row when the text is an option", async () => {
      render(<InForm onSubmit={vi.fn()} />);
      await userEvent.type(screen.getByRole("combobox"), "netflix");
      expect(screen.getByRole("option", { name: "Netflix" })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: /^Add / })).toBeNull();
    });

    // An Android keyboard reporting its action key as keyCode 229: the
    // keydown cannot be read as Enter, but the browser still submits the
    // form, and that submit is where the text is taken.
    it("adds instead of saving when an unreadable Enter submits the form", () => {
      const onSubmit = vi.fn();
      render(<InForm onSubmit={onSubmit} />);
      const input = screen.getByRole("combobox");
      act(() => input.focus());
      fireEvent.change(input, { target: { value: "MAPPA" } });
      fireEvent.keyDown(input, { key: "Unidentified", keyCode: 229 });
      expect(screen.getByTestId("value")).toHaveTextContent(/^$/);
      fireEvent.submit(input.form);
      expect(screen.getByTestId("value")).toHaveTextContent(/^MAPPA$/);
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("does not add on an Enter that confirms an IME composition", () => {
      render(<InForm onSubmit={vi.fn()} />);
      const input = screen.getByRole("combobox");
      act(() => input.focus());
      fireEvent.change(input, { target: { value: "きょうと" } });
      fireEvent.keyDown(input, { key: "Enter", keyCode: 13, isComposing: true });
      expect(screen.getByTestId("value")).toHaveTextContent(/^$/);
    });

    it("shows the phone keyboard an Enter key rather than Go", () => {
      render(<InForm onSubmit={vi.fn()} />);
      expect(screen.getByRole("combobox")).toHaveAttribute("enterkeyhint", "enter");
    });
  });
});
