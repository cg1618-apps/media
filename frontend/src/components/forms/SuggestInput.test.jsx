// SuggestInput's contract: the suggestions are only suggestions. It opens on
// focus, narrows as you type, picks by press or by Enter on a highlight, and
// Enter with nothing highlighted keeps exactly what was typed.
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import SuggestInput from "./SuggestInput";

const OPTIONS = ["Pixiv", "Patreon", "Fanbox", "Ci-en"];

function Controlled({ initial = "", onKeyDown, onPick }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <SuggestInput
        aria-label="Source"
        value={value}
        onChange={setValue}
        options={OPTIONS}
        onKeyDown={onKeyDown}
        onPick={onPick}
      />
      <output data-testid="value">{value}</output>
    </>
  );
}

const optionNames = () => screen.queryAllByRole("option").map((o) => o.textContent);

describe("SuggestInput", () => {
  it("opens every option on focus, in a list outside the input's box", async () => {
    const { container } = render(<Controlled />);
    await userEvent.click(screen.getByRole("combobox", { name: "Source" }));
    expect(optionNames()).toEqual(OPTIONS);
    // Portaled into document.body, so no scroll container can clip it.
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    expect(screen.getByRole("listbox").parentElement).toBe(document.body);
  });

  it("narrows as you type, prefix matches first", async () => {
    render(<Controlled />);
    await userEvent.type(screen.getByRole("combobox"), "n");
    // "n" starts nothing here, so it is contains-order: Patreon, Fanbox, Ci-en.
    expect(optionNames()).toEqual(["Patreon", "Fanbox", "Ci-en"]);
    await userEvent.clear(screen.getByRole("combobox"));
    await userEvent.type(screen.getByRole("combobox"), "p");
    expect(optionNames()).toEqual(["Pixiv", "Patreon"]);
  });

  it("keeps the typed text on Enter when nothing is highlighted", async () => {
    const onKeyDown = vi.fn();
    render(<Controlled onKeyDown={onKeyDown} />);
    await userEvent.type(screen.getByRole("combobox"), "Pa{Enter}");
    expect(screen.getByTestId("value")).toHaveTextContent(/^Pa$/);
    // The Enter was not the list's, so it reaches the caller.
    expect(onKeyDown).toHaveBeenCalledWith(expect.objectContaining({ key: "Enter" }));
  });

  it("picks the highlighted option with ArrowDown and Enter", async () => {
    const onPick = vi.fn();
    render(<Controlled onPick={onPick} />);
    await userEvent.type(screen.getByRole("combobox"), "p{ArrowDown}{ArrowDown}{Enter}");
    expect(screen.getByTestId("value")).toHaveTextContent("Patreon");
    expect(onPick).toHaveBeenCalledWith("Patreon");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("picks on mousedown, before the input can blur", async () => {
    render(<Controlled />);
    const input = screen.getByRole("combobox");
    await userEvent.click(input);
    fireEvent.mouseDown(screen.getByRole("option", { name: "Fanbox" }));
    expect(screen.getByTestId("value")).toHaveTextContent("Fanbox");
    expect(input).toHaveFocus();
  });

  it("closes the list on the first Escape and passes the next one on", async () => {
    const onKeyDown = vi.fn();
    render(<Controlled onKeyDown={onKeyDown} />);
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onKeyDown).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    expect(onKeyDown).toHaveBeenCalledWith(expect.objectContaining({ key: "Escape" }));
  });
});
