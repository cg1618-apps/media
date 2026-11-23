// The person form's Affiliation field: studios picked by id, shown as chips,
// removable, and never offered twice.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import StudioAffiliationField from "./StudioAffiliationField";

const STUDIOS = [
  { system_id: "s1", display_name: "Shaft", name_en: "Shaft" },
  { system_id: "s2", display_name: "81 Produce", name_jp: "81プロデュース" },
];

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(STUDIOS) })),
  );
});
afterEach(() => vi.unstubAllGlobals());

function Harness({ initial, onChange }) {
  const [value, setValue] = useState(initial);
  return (
    <StudioAffiliationField
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

function mount(initial = []) {
  const onChange = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Harness initial={initial} onChange={onChange} />
    </QueryClientProvider>,
  );
  return onChange;
}

it("adds a studio picked by any of its names", async () => {
  const user = userEvent.setup();
  const onChange = mount();
  await user.type(screen.getByPlaceholderText("Search a studio to add…"), "81プロ");
  await user.click(await screen.findByText("81 Produce"));
  expect(onChange).toHaveBeenLastCalledWith([{ system_id: "s2", display_name: "81 Produce" }]);
  expect(screen.getByRole("list", { name: "Affiliated studios" })).toHaveTextContent("81 Produce");
});

it("removes a chosen studio", async () => {
  const user = userEvent.setup();
  const onChange = mount([{ system_id: "s1", display_name: "Shaft" }]);
  await user.click(screen.getByRole("button", { name: "Remove Shaft" }));
  expect(onChange).toHaveBeenLastCalledWith([]);
});

it("does not offer a studio already chosen", async () => {
  const user = userEvent.setup();
  mount([{ system_id: "s1", display_name: "Shaft" }]);
  await user.click(screen.getByPlaceholderText("Search a studio to add…"));
  await screen.findByText("81 Produce");
  // Shaft appears once: as the chip, not again as an option.
  expect(screen.getAllByText("Shaft")).toHaveLength(1);
});
