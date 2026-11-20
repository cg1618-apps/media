// Frontend: the single-choice chip row the gender and role fields use. One
// click picks, a click on the picked chip clears to "".
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import QuickPicks, { pickValue } from "./QuickPicks";

const OPTIONS = ["Main", "Core", "Supporting", "Other"];

function renderPicks(value) {
  const onChange = vi.fn();
  render(<QuickPicks label="Role" options={OPTIONS} value={value} onChange={onChange} />);
  return onChange;
}

describe("pickValue", () => {
  it("picks an option that is not held", () => {
    expect(pickValue("", "Main")).toBe("Main");
    expect(pickValue("Core", "Main")).toBe("Main");
  });

  it("clears the option that is held", () => {
    expect(pickValue("Main", "Main")).toBe("");
  });
});

describe("QuickPicks", () => {
  it("draws one chip per option inside a labelled group", () => {
    renderPicks("");
    const group = screen.getByRole("group", { name: "Role" });
    expect(group.querySelectorAll("button")).toHaveLength(4);
  });

  it("marks only the held option as pressed", () => {
    renderPicks("Core");
    expect(screen.getByRole("button", { name: "Core" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Main" })).toHaveAttribute("aria-pressed", "false");
  });

  it("presses nothing for a value the vocabulary does not offer", () => {
    renderPicks("其他");
    for (const option of OPTIONS) {
      expect(screen.getByRole("button", { name: option })).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("sets the clicked option", async () => {
    const onChange = renderPicks("Main");
    await userEvent.setup().click(screen.getByRole("button", { name: "Other" }));
    expect(onChange).toHaveBeenCalledWith("Other");
  });

  it("clears to blank when the held option is clicked again", async () => {
    const onChange = renderPicks("Main");
    await userEvent.setup().click(screen.getByRole("button", { name: "Main" }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});
