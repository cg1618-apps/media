// Frontend: the Add tab's "auto-fill from existing entry" box.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import EntryAutofillSearch from "./EntryAutofillSearch";

const FRANCHISES = [{ system_id: "f1", franchise_name_cn: "系列" }];
const ITEMS = [
  { system_id: "a", name_cn: "甲", name_en: "Alpha", region: "JP", franchise_id: "f1" },
  { system_id: "b", name_cn: "乙", name_en: "Beta" },
];

function renderSearch(props = {}) {
  const onPick = vi.fn();
  render(
    <EntryAutofillSearch
      items={ITEMS}
      names={(i) => [i.name_cn, i.name_en]}
      title={(i) => i.name_cn}
      franchises={FRANCHISES}
      badge={(i) => i.region}
      onPick={onPick}
      {...props}
    />,
  );
  return onPick;
}

function box() {
  return screen.getByRole("textbox", { name: "Auto-fill from existing entry" });
}

describe("EntryAutofillSearch", () => {
  it("lists only the entries whose names match", async () => {
    renderSearch();

    await userEvent.type(box(), "alp");

    expect(screen.getByRole("button", { name: /甲/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /乙/ })).not.toBeInTheDocument();
    expect(screen.getByText("JP")).toBeInTheDocument();
    expect(screen.getByText("系列")).toBeInTheDocument();
  });

  it("hands the picked entry over, then clears itself", async () => {
    const onPick = renderSearch();

    await userEvent.type(box(), "beta");
    await userEvent.click(screen.getByRole("button", { name: /乙/ }));

    expect(onPick).toHaveBeenCalledWith(ITEMS[1]);
    expect(box()).toHaveValue("");
    expect(screen.queryByRole("button", { name: /乙/ })).not.toBeInTheDocument();
  });

  it("shows nothing until something is typed", () => {
    renderSearch();

    expect(screen.queryByRole("button", { name: /甲/ })).not.toBeInTheDocument();
  });

  it("is disabled while the entries are still loading", () => {
    renderSearch({ loading: true });

    expect(box()).toBeDisabled();
  });
});
