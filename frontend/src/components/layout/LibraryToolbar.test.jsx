import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import LibraryToolbar from "./LibraryToolbar";

const SORT = {
  options: [{ value: "title", label: "Title" }],
  value: "title",
  onChange: () => {},
  reversed: false,
  onReversedChange: () => {},
};

describe("LibraryToolbar", () => {
  it("draws search and sort alone for a library with no filters and one view", () => {
    render(<LibraryToolbar search={{ value: "", onChange: () => {} }} sort={SORT} />);
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Sort" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Filters/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Table view" })).toBeNull();
  });

  it("lets the search field take the row's remaining width", () => {
    render(<LibraryToolbar search={{ value: "", onChange: () => {} }} sort={SORT} />);
    expect(screen.getByRole("searchbox").parentElement.className).toContain("flex-1");
  });

  it("draws the filter toggle and the view toggle when given, and reports each", async () => {
    const onToggle = vi.fn();
    const onView = vi.fn();
    render(
      <LibraryToolbar
        search={{ value: "x", onChange: () => {} }}
        sort={SORT}
        filters={{ open: false, onToggle, activeFilterCount: 2 }}
        view={{ value: "grid", onChange: onView }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    expect(onToggle).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Grid view" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Table view" }));
    expect(onView).toHaveBeenCalledWith("table");
  });

  it("clears the search with its own button", async () => {
    const onChange = vi.fn();
    render(<LibraryToolbar search={{ value: "frieren", onChange }} sort={SORT} />);
    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});
