// Frontend: the multi-choice chip field the h-game form uses for audio,
// H-presentation and platform. Its one job beyond toggling is keeping two
// answers apart: [] ("none of these") and null ("not recorded").
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import ChoiceChips, { toggleChoice } from "./ChoiceChips";

const OPTIONS = ["靜圖", "動圖", "2D動畫", "3D動畫", "互動"];

function renderChips(value) {
  const onChange = vi.fn();
  render(<ChoiceChips label="H 演出形式" options={OPTIONS} value={value} onChange={onChange} />);
  return onChange;
}

describe("toggleChoice", () => {
  it("keeps the vocabulary order whatever the click order", () => {
    expect(toggleChoice(OPTIONS, ["互動"], "靜圖")).toEqual(["靜圖", "互動"]);
  });

  it("starts a list from null and empties to [] rather than null", () => {
    expect(toggleChoice(OPTIONS, null, "動圖")).toEqual(["動圖"]);
    expect(toggleChoice(OPTIONS, ["動圖"], "動圖")).toEqual([]);
  });

  it("keeps a stored value the vocabulary no longer has", () => {
    expect(toggleChoice(OPTIONS, ["Legacy"], "靜圖")).toEqual(["靜圖", "Legacy"]);
  });
});

describe("ChoiceChips", () => {
  it("marks Unknown for null and None for []", () => {
    renderChips(null);
    expect(screen.getByRole("button", { name: "Unknown" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "None" })).toHaveAttribute("aria-pressed", "false");
  });

  it("marks None, not Unknown, for an empty list", () => {
    renderChips([]);
    expect(screen.getByRole("button", { name: "None" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Unknown" })).toHaveAttribute("aria-pressed", "false");
  });

  it("toggles an option into the list", async () => {
    const onChange = renderChips(["互動"]);
    expect(screen.getByRole("button", { name: "互動" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.setup().click(screen.getByRole("button", { name: "靜圖" }));
    expect(onChange).toHaveBeenCalledWith(["靜圖", "互動"]);
  });

  it("sets [] with None and null with Unknown", async () => {
    const user = userEvent.setup();
    const onChange = renderChips(["靜圖"]);
    await user.click(screen.getByRole("button", { name: "None" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    await user.click(screen.getByRole("button", { name: "Unknown" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
