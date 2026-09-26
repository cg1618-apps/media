// Frontend: the Modify editor's "Other entries in this franchise" ribbon.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import FranchiseRibbon from "./FranchiseRibbon";

const SERIES = [{ system_id: "s1", series_name_cn: "第一部" }];
// One sibling in a series, one without, the entry being edited, and one in
// another franchise - so each exclusion has something to exclude.
const ENTRIES = [
  { system_id: "self", franchise_id: "f1", game_name_cn: "本作" },
  { system_id: "a", franchise_id: "f1", series_id: "s1", game_name_cn: "續作", game_type: "DLC" },
  { system_id: "b", franchise_id: "f1", game_name_cn: "外傳" },
  { system_id: "c", franchise_id: "f2", game_name_cn: "別的系列" },
];

function renderRibbon(props = {}) {
  const onOpen = vi.fn();
  const view = render(
    <FranchiseRibbon
      entries={ENTRIES}
      type="game"
      franchiseId="f1"
      excludeId="self"
      allSeries={SERIES}
      badge={(e) => e.game_type}
      onOpen={onOpen}
      {...props}
    />,
  );
  return { onOpen, ...view };
}

describe("FranchiseRibbon", () => {
  it("lists the other entries of the franchise, grouped by series", () => {
    renderRibbon();

    expect(screen.getByText("Other entries in this franchise")).toBeInTheDocument();
    expect(screen.getByText("第一部")).toBeInTheDocument();
    expect(screen.getByText("No Series")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /續作/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /外傳/ })).toBeInTheDocument();
    expect(screen.getByText("DLC")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /本作/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /別的系列/ })).not.toBeInTheDocument();
  });

  it("opens the clicked entry", async () => {
    const { onOpen } = renderRibbon();

    await userEvent.click(screen.getByRole("button", { name: /外傳/ }));

    expect(onOpen).toHaveBeenCalledWith(ENTRIES[2]);
  });

  it("renders nothing without a franchise, or with no siblings", () => {
    const { container, rerender } = renderRibbon({ franchiseId: null });
    expect(container).toBeEmptyDOMElement();

    rerender(
      <FranchiseRibbon entries={ENTRIES} type="game" franchiseId="f2" excludeId="c" onOpen={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
