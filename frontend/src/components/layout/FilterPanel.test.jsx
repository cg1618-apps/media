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

// ---------------------------------------------------------------------------
// Option hints and the advanced section
// ---------------------------------------------------------------------------
const ADVANCED_DEFS = [
  {
    key: "status",
    label: "Status",
    type: "set-grouped",
    groupOptions: ["Planned", "Done"],
    optionHint: (v) => `Includes: ${v} things`,
    match: () => true,
  },
  {
    key: "genre",
    label: "Genre",
    type: "set",
    options: ["奇幻", "日常"],
    advanced: true,
    match: () => true,
  },
];

function AdvancedHarness() {
  const state = useFilterState(ADVANCED_DEFS, []);
  return (
    <FilterPanel
      filterDefs={ADVANCED_DEFS}
      filters={state.filters}
      toggleFilter={state.toggleFilter}
      clearFilters={state.clearFilters}
      activeFilterCount={state.activeFilterCount}
      dynamicFilterOptions={{}}
    />
  );
}

it("gives a chip its def's hint as a hover title", () => {
  render(<AdvancedHarness />);
  expect(screen.getByRole("button", { name: "Planned" })).toHaveAttribute(
    "title",
    "Includes: Planned things",
  );
});

// A def with option hints marks its label with a circled "?"; hovering or
// focusing it lists every option with what it includes. A def with no hints
// gets no mark.
it("puts a help mark after a hinted def's label that explains every option", async () => {
  const user = userEvent.setup();
  render(<AdvancedHarness />);
  const help = screen.getByRole("button", { name: "What the Status options mean" });
  expect(help.querySelector(".fa-circle-question")).not.toBeNull();
  expect(screen.queryByRole("tooltip")).toBeNull();

  await user.hover(help);
  const tip = screen.getByRole("tooltip");
  expect(help).toHaveAttribute("aria-describedby", tip.id);
  expect(tip).toHaveTextContent("Planned");
  expect(tip).toHaveTextContent("Includes: Planned things");
  expect(tip).toHaveTextContent("Done");
  expect(tip).toHaveTextContent("Includes: Done things");

  await user.unhover(help);
  expect(screen.queryByRole("tooltip")).toBeNull();

  await user.tab();
  while (document.activeElement !== help) await user.tab();
  expect(screen.getByRole("tooltip")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /Advanced filters/ }));
  expect(screen.queryByRole("button", { name: "What the Genre options mean" })).toBeNull();
});

it("keeps advanced filters collapsed until the button opens them", async () => {
  const user = userEvent.setup();
  render(<AdvancedHarness />);
  const toggle = screen.getByRole("button", { name: /Advanced filters/ });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("button", { name: "奇幻" })).not.toBeInTheDocument();
  // The ordinary filters are drawn while it is collapsed.
  expect(screen.getByRole("button", { name: "Planned" })).toBeInTheDocument();

  await user.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  await user.click(screen.getByRole("button", { name: "奇幻" }));

  // Collapsed again, the button still counts what is on inside.
  await user.click(toggle);
  expect(screen.queryByRole("button", { name: "奇幻" })).not.toBeInTheDocument();
  expect(toggle).toHaveTextContent("1");
});

it("draws no advanced button for defs with nothing advanced", () => {
  render(<Harness />);
  expect(screen.queryByRole("button", { name: /Advanced filters/ })).not.toBeInTheDocument();
});

// Consecutive defs that share a `row` are drawn side by side in one row, the
// first at the left; a def with no row keeps a row of its own.
it("draws defs that share a row side by side, in def order", () => {
  const defs = [
    { key: "status", label: "Status", type: "set", options: ["On"], match: () => true },
    { key: "kind", label: "Kind", type: "set", options: ["TV"], row: "kind", match: () => true },
    { key: "region", label: "Region", type: "set", options: ["US"], row: "kind", match: () => true },
  ];
  function Harness() {
    const state = useFilterState(defs, []);
    return (
      <FilterPanel
        filterDefs={defs}
        filters={state.filters}
        toggleFilter={state.toggleFilter}
        clearFilters={state.clearFilters}
        activeFilterCount={state.activeFilterCount}
        dynamicFilterOptions={{}}
      />
    );
  }
  render(<Harness />);
  const kindGroup = screen.getByText("Kind").parentElement;
  const regionGroup = screen.getByText("Region").parentElement;
  const statusGroup = screen.getByText("Status").parentElement;
  expect(kindGroup.parentElement).toBe(regionGroup.parentElement);
  expect(kindGroup.parentElement.className).toMatch(/\bflex\b/);
  expect(kindGroup.nextElementSibling).toBe(regionGroup);
  expect(statusGroup.parentElement).not.toBe(kindGroup.parentElement);
});

// A range def draws a minimum and a maximum input; typing in either sets the
// filter, and one bound alone is enough. It lives in the advanced section like
// the tag filters, and counts toward the toggle's badge.
it("draws a range filter as two number inputs that set it", async () => {
  const user = userEvent.setup();
  const defs = [
    {
      key: "hltb",
      label: "HLTB Main + Extra",
      type: "range",
      unit: "h",
      advanced: true,
      match: () => true,
    },
  ];
  function Harness() {
    const state = useFilterState(defs, []);
    return (
      <>
      <output data-testid="range-state">{JSON.stringify(state.filters.hltb)}</output>
      <FilterPanel
        filterDefs={defs}
        filters={state.filters}
        toggleFilter={state.toggleFilter}
        clearFilters={state.clearFilters}
        activeFilterCount={state.activeFilterCount}
        dynamicFilterOptions={{}}
      />
      </>
    );
  }
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: /Advanced filters/ }));
  const min = screen.getByRole("spinbutton", { name: "HLTB Main + Extra minimum" });
  const max = screen.getByRole("spinbutton", { name: "HLTB Main + Extra maximum" });
  await user.type(max, "40");
  expect(JSON.parse(screen.getByTestId("range-state").textContent)).toEqual({ min: "", max: "40" });
  expect(min).toHaveValue(null);
  expect(screen.getByRole("button", { name: /Advanced filters/ })).toHaveTextContent("1");
});
