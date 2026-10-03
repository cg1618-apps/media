// ComboBox's selection contract: onSelect receives (id, label), not the item.
// Three pickers (MemeForm, MemeOwnerPicker, QuoteEntryPicker) read `item?.id`
// from the first argument and never stored a selection; this pins the shape
// every caller must follow.
import { fireEvent, render, screen } from "@testing-library/react";

import ComboBox from "./ComboBox";
import userEvent from "@testing-library/user-event";

const ITEMS = [
  { id: "q1", label: "Nothing is true" },
  { id: "q2", label: "Everything is permitted" },
];

it("calls onSelect with the id first and the label second", () => {
  const onSelect = vi.fn();
  render(<ComboBox items={ITEMS} onSelect={onSelect} placeholder="Search" />);

  fireEvent.change(screen.getByPlaceholderText("Search"), { target: { value: "Every" } });
  // An option picks on mousedown, so the input never blurs before it lands.
  fireEvent.mouseDown(screen.getByRole("option", { name: "Everything is permitted" }));

  expect(onSelect).toHaveBeenCalledWith("q2", "Everything is permitted");
});

it("picks the highlighted result with ArrowDown and Enter", async () => {
  const onSelect = vi.fn();
  render(<ComboBox items={ITEMS} onSelect={onSelect} placeholder="Search" />);

  await userEvent.click(screen.getByPlaceholderText("Search"));
  await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");

  expect(onSelect).toHaveBeenCalledWith("q2", "Everything is permitted");
});

it("ranks exact, then prefix, then contains matches only when asked", async () => {
  const items = [
    { id: "1", label: "Kana Hanazawa" },
    { id: "2", label: "Hana" },
    { id: "3", label: "Hanae Natsuki" },
  ];
  const labels = () => screen.getAllByRole("option").map((o) => o.textContent);

  const { unmount } = render(<ComboBox items={items} placeholder="Search" rankMatches />);
  await userEvent.type(screen.getByPlaceholderText("Search"), "hana");
  expect(labels()).toEqual(["Hana", "Hanae Natsuki", "Kana Hanazawa"]);
  unmount();

  render(<ComboBox items={items} placeholder="Search" />);
  await userEvent.type(screen.getByPlaceholderText("Search"), "hana");
  expect(labels()).toEqual(["Kana Hanazawa", "Hana", "Hanae Natsuki"]);
});
