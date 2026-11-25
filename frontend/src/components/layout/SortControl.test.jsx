import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import SortControl from "./SortControl";

const OPTIONS = [
  { value: "title", label: "Title" },
  { value: "my_rating", label: "My rating", descending: true },
];

function renderControl(props = {}) {
  const onChange = vi.fn();
  const onReversedChange = vi.fn();
  render(
    <SortControl
      options={OPTIONS}
      value="title"
      onChange={onChange}
      reversed={false}
      onReversedChange={onReversedChange}
      {...props}
    />,
  );
  return { onChange, onReversedChange };
}

describe("SortControl", () => {
  it("captions the select Sort and offers the plain labels", () => {
    renderControl();
    const select = screen.getByRole("combobox", { name: "Sort" });
    expect([...select.options].map((o) => o.textContent)).toEqual(["Title", "My rating"]);
  });

  it("reports a chosen sort", async () => {
    const { onChange } = renderControl();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Sort" }), "my_rating");
    expect(onChange).toHaveBeenCalledWith("my_rating");
  });

  it("shows the direction the list runs in and flips it", async () => {
    const { onReversedChange } = renderControl();
    const button = screen.getByRole("button", { name: "Reverse order" });
    expect(button).toHaveAttribute("title", "Ascending");
    expect(button).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(button);
    expect(onReversedChange).toHaveBeenCalledWith(true);
  });

  it("reads a descending sort as descending, and reversed as ascending", () => {
    renderControl({ value: "my_rating" });
    expect(screen.getByRole("button", { name: "Reverse order" })).toHaveAttribute(
      "title",
      "Descending",
    );
  });

  it("reads a reversed descending sort as ascending", () => {
    renderControl({ value: "my_rating", reversed: true });
    const button = screen.getByRole("button", { name: "Reverse order" });
    expect(button).toHaveAttribute("title", "Ascending");
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  it("draws no direction button for a caller that cannot reverse", () => {
    render(<SortControl options={OPTIONS} value="title" onChange={() => {}} />);
    expect(screen.queryByRole("button", { name: "Reverse order" })).toBeNull();
  });
});
