// Frontend: the pill picker behind every tag field. Two props that read
// alike and mean different things: `limit` caps how many options the
// dropdown SHOWS, `max` caps how many values can be SELECTED. The anime
// Exclusive Source field once passed limit={1} meaning "one value", which
// hid every platform but the first.
import { render, screen } from "@testing-library/react";
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
    await userEvent.click(screen.getByRole("textbox"));
    for (const p of PLATFORMS) {
      expect(screen.getByRole("button", { name: p })).toBeInTheDocument();
    }
  });

  it("caps the shown options at limit", async () => {
    renderPicker({ limit: 2 });
    await userEvent.click(screen.getByRole("textbox"));
    expect(screen.getByRole("button", { name: "Disney+" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Netflix" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Crunchyroll" })).toBeNull();
  });

  it("replaces the held value rather than adding a second when max is reached", async () => {
    const onChange = renderPicker({ value: "Disney+", limit: null, max: 1 });
    await userEvent.click(screen.getByRole("textbox"));
    await userEvent.click(screen.getByRole("button", { name: "Netflix" }));
    expect(onChange).toHaveBeenLastCalledWith("Netflix");
  });

  it("adds without limit when max is not given", async () => {
    const onChange = renderPicker({ value: "Disney+", limit: null });
    await userEvent.click(screen.getByRole("textbox"));
    await userEvent.click(screen.getByRole("button", { name: "Netflix" }));
    expect(onChange).toHaveBeenLastCalledWith("Disney+, Netflix");
  });
});
