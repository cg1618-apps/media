// FilterPanel's parent chip: drawn after the def's options and boxed with its
// children, switching them by the toggleParentValues rules through the
// caller's ordinary toggleFilter.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";

import FilterPanel from "./FilterPanel";
import { useFilterState } from "../../hooks/useFilterState";

const DEFS = [
  {
    key: "mediaType",
    label: "Entry type",
    type: "set",
    options: ["anime"],
    parent: { label: "Restricted", children: ["h-comic", "hentai"] },
    match: () => true,
  },
];

function Harness() {
  const state = useFilterState(DEFS, []);
  return (
    <>
      <FilterPanel
        filterDefs={DEFS}
        filters={state.filters}
        toggleFilter={state.toggleFilter}
        clearFilters={state.clearFilters}
        activeFilterCount={state.activeFilterCount}
        dynamicFilterOptions={{}}
      />
      <output>{[...state.filters.mediaType].sort().join(",")}</output>
    </>
  );
}

function pressed(name) {
  return screen.getByRole("button", { name }).getAttribute("aria-pressed");
}

it("boxes the parent with its children and switches them all", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const group = screen.getByRole("group", { name: "Restricted" });
  expect(within(group).getByRole("button", { name: "h-comic" })).toBeInTheDocument();
  expect(within(group).getByRole("button", { name: "hentai" })).toBeInTheDocument();

  // none on -> all on
  await user.click(screen.getByRole("button", { name: "Restricted" }));
  expect(screen.getByRole("status")).toHaveTextContent("h-comic,hentai");
  expect(pressed("Restricted")).toBe("true");

  // all on -> all off
  await user.click(screen.getByRole("button", { name: "Restricted" }));
  expect(screen.getByRole("status")).toHaveTextContent(/^$/);
  expect(pressed("Restricted")).toBe("false");
});

it("turns the rest on from some, and a child toggles only itself", async () => {
  const user = userEvent.setup();
  render(<Harness />);

  await user.click(screen.getByRole("button", { name: "anime" }));
  await user.click(screen.getByRole("button", { name: "hentai" }));
  expect(screen.getByRole("status")).toHaveTextContent("anime,hentai");
  // Only some children on: the parent is not active.
  expect(pressed("Restricted")).toBe("false");

  await user.click(screen.getByRole("button", { name: "Restricted" }));
  expect(screen.getByRole("status")).toHaveTextContent("anime,h-comic,hentai");
  expect(pressed("Restricted")).toBe("true");

  await user.click(screen.getByRole("button", { name: "h-comic" }));
  expect(screen.getByRole("status")).toHaveTextContent("anime,hentai");
  expect(pressed("Restricted")).toBe("false");
});

it("clears children with the rest on Clear all", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Restricted" }));
  await user.click(screen.getByRole("button", { name: "Clear all" }));
  expect(screen.getByRole("status")).toHaveTextContent(/^$/);
});
