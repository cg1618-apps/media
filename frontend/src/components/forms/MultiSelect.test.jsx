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

  it("offers idleOptions with an empty box, and every option once typing", async () => {
    // Crunchyroll is an option but not idle: it must be absent until typed,
    // and then found - the same option both ways.
    renderPicker({ limit: null, idleOptions: ["Netflix", "Disney+"] });
    await userEvent.click(screen.getByRole("combobox"));
    expect(
      screen.getAllByRole("option").map((o) => o.textContent),
    ).toEqual(["Netflix", "Disney+"]);

    await userEvent.type(screen.getByRole("combobox"), "cr");
    expect(screen.getByRole("option", { name: "Crunchyroll" })).toBeInTheDocument();
  });

  it("puts prefix matches first while typing, keeping the given order inside each", async () => {
    // Given order is by appearances; "st" starts two of them and is merely
    // contained in the most used one, which therefore drops behind both.
    renderPicker({
      limit: null,
      options: ["Kyoto Studio", "Studio Shaft", "Hentai Studio", "Studio Bones"],
    });
    await userEvent.type(screen.getByRole("combobox"), "st");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Studio Shaft",
      "Studio Bones",
      "Kyoto Studio",
      "Hentai Studio",
    ]);
  });

  it("adds without limit when max is not given", async () => {
    const onChange = renderPicker({ value: "Disney+", limit: null });
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(screen.getByRole("option", { name: "Netflix" }));
    expect(onChange).toHaveBeenLastCalledWith("Disney+, Netflix");
  });
});
