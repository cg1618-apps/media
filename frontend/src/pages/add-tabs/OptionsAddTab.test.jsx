// The Add page's System Options form. Guards the one thing that separates it
// from the Modify and Delete pickers: a category is chosen from the declared
// vocabulary, never typed, so the Add page can no longer invent one.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import OptionsAddTab from "./OptionsAddTab";

const CATEGORIES = [
  "Character Group",
  "Comic Era",
  "Comic Imprint",
  "Enemy Tier",
  "Game Genre",
  "Game Theme",
  "Genre Main",
  "Label",
  "Needs Work Note",
  "Song Source",
  "Song Type",
];

function renderTab(optionsSubTab = "options", props = {}) {
  return render(
    <OptionsAddTab
      optionsSubTab={optionsSubTab}
      setOptionsSubTab={vi.fn()}
      optCategory=""
      setOptCategory={vi.fn()}
      optValues={[""]}
      setOptValues={vi.fn()}
      optionCategories={CATEGORIES}
      optScopes={[]}
      setOptScopes={vi.fn()}
      optUsages={[]}
      setOptUsages={vi.fn()}
      optAliases={[]}
      setOptAliases={vi.fn()}
      {...props}
    />,
  );
}

describe("OptionsAddTab", () => {
  it("offers the category as a closed picker, with no way to type a new one", () => {
    const { container } = renderTab();
    expect(container.querySelector("datalist")).toBeNull();
    // The value inputs are still text boxes; none of them takes a category.
    expect(
      [...container.querySelectorAll("input")].some((i) => i.getAttribute("list")),
    ).toBe(false);
    expect(screen.getAllByRole("combobox").length).toBeGreaterThan(0);
  });

  it("groups the Options sub-tab's categories, tags excluded", () => {
    const { container } = renderTab("options");
    const labels = [...container.querySelectorAll("optgroup")].map((g) => g.label);
    expect(labels).toEqual(["Game", "Comic"]);
    const values = [...container.querySelectorAll("optgroup option")].map(
      (o) => o.value,
    );
    expect(values).not.toContain("Label");
    expect(values).not.toContain("Genre Main");
  });

  it("offers only the tag categories on the Tags sub-tab", () => {
    const { container } = renderTab("tags");
    const values = [...container.querySelectorAll("option")]
      .map((o) => o.value)
      .filter(Boolean);
    expect(values).toEqual(["Genre Main", "Label"]);
  });

  it("offers only the common option categories on their sub-tab, grouped", () => {
    const { container } = renderTab("common");
    const values = [...container.querySelectorAll("option")]
      .map((o) => o.value)
      .filter(Boolean);
    expect(values).toEqual([
      "Character Group",
      "Enemy Tier",
      "Song Type",
      "Song Source",
      "Needs Work Note",
    ]);
    const labels = [...container.querySelectorAll("optgroup")].map((g) => g.label);
    expect(labels).toEqual(["Note Suggestion", "Music", "Needs Work"]);
  });

  it("keeps the common option categories off the Options sub-tab", () => {
    const { container } = renderTab("options");
    const values = [...container.querySelectorAll("option")].map((o) => o.value);
    expect(values).not.toContain("Character Group");
    expect(values).not.toContain("Song Type");
    expect(values).not.toContain("Needs Work Note");
  });

  it("offers usages on Platform, the one category that takes them", () => {
    renderTab("options", { optCategory: "Platform" });
    expect(screen.getByRole("button", { name: "watch" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "origin" })).toBeInTheDocument();
  });

  it("hides usages on every other category", () => {
    renderTab("options", { optCategory: "Genre Main" });
    expect(screen.queryByRole("button", { name: "watch" })).toBeNull();
    expect(screen.queryByRole("button", { name: "origin" })).toBeNull();
  });

  it("offers a scope picker on the Options and Tags sub-tabs", () => {
    for (const subTab of ["options", "tags"]) {
      const { unmount } = renderTab(subTab);
      expect(screen.getByText("Scopes")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "anime" })).toBeInTheDocument();
      unmount();
    }
  });

  it("shows no scope picker on the Common Options sub-tab, whose categories own their scope", () => {
    renderTab("common", { optCategory: "Song Type" });
    expect(screen.queryByText("Scopes")).toBeNull();
    expect(screen.queryByRole("button", { name: "anime" })).toBeNull();
  });
});
