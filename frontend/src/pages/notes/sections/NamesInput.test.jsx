// NamesInput: the suggestions are a convenience, never a vocabulary. Enter
// takes the typed text unless a suggestion is highlighted, and a press on a
// suggestion lands before the input's blur can add the half-typed text.
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import NamesInput from "./NamesInput";

function Controlled() {
  const [value, setValue] = useState([]);
  return (
    <>
      <NamesInput label="Characters" value={value} onChange={setValue} suggestions={["Aoi", "Aoba", "Kaede"]} />
      <output data-testid="names">{value.join("|")}</output>
    </>
  );
}

describe("NamesInput", () => {
  it("adds the typed name on Enter when no suggestion is highlighted", async () => {
    render(<Controlled />);
    await userEvent.type(screen.getByRole("combobox", { name: "Characters" }), "Ao{Enter}");
    expect(screen.getByTestId("names")).toHaveTextContent(/^Ao$/);
  });

  it("adds the highlighted suggestion on Enter", async () => {
    render(<Controlled />);
    await userEvent.type(screen.getByRole("combobox"), "Ao{ArrowDown}{ArrowDown}{Enter}");
    expect(screen.getByTestId("names")).toHaveTextContent(/^Aoba$/);
  });

  it("adds a pressed suggestion, not the half-typed text", async () => {
    render(<Controlled />);
    await userEvent.type(screen.getByRole("combobox"), "Ka");
    fireEvent.mouseDown(screen.getByRole("option", { name: "Kaede" }));
    expect(screen.getByTestId("names")).toHaveTextContent(/^Kaede$/);
  });

  // A phone keyboard's Enter is not always readable, so the typed name is
  // also a row to tap - even when no suggestion matches it at all.
  it("adds the typed name from its Add row", async () => {
    render(<Controlled />);
    await userEvent.type(screen.getByRole("combobox"), "Mio");
    fireEvent.mouseDown(screen.getByRole("option", { name: 'Add "Mio"' }));
    expect(screen.getByTestId("names")).toHaveTextContent(/^Mio$/);
  });

  it("offers no Add row for a name that is already a suggestion", async () => {
    render(<Controlled />);
    await userEvent.type(screen.getByRole("combobox"), "kaede");
    expect(screen.queryByRole("option", { name: /^Add / })).toBeNull();
  });

  it("ignores an Enter that confirms an IME composition", async () => {
    render(<Controlled />);
    const input = screen.getByRole("combobox");
    await userEvent.type(input, "Ao");
    fireEvent.keyDown(input, { key: "Enter", keyCode: 13, isComposing: true });
    expect(screen.getByTestId("names")).toHaveTextContent(/^$/);
  });
});
