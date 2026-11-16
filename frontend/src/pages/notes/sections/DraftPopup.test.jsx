// Frontend: a new note row's form opens in a non-modal popup (DraftPopup in
// ./ui), so the rows behind it stay readable and selectable while it is
// written - the point is to copy from them.
//
// Pinned on TextLinksSection with saved rows on the page: a popup that trapped
// the page would show up as those rows being unreachable, and with no rows
// there would be nothing to reach.
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import TextLinksSection from "./TextLinksSection";
import { DraftPopup } from "./ui";

// jsdom has no PointerEvent, so fireEvent.pointer* would carry no
// coordinates; a MouseEvent carries the ones a drag reads.
if (!window.PointerEvent) window.PointerEvent = class extends MouseEvent {};

const EASTER_EGGS = {
  key: "easter_eggs",
  shape: "text_links",
  label: "彩蛋/致敬 Easter Eggs/References",
  locator_placeholder: "Episode(s), e.g. ep 3",
  locator_required: false,
  desc_required: false,
  fields: [],
};

const ROWS = [
  { system_id: "n1", section: "easter_eggs", content: "A nod to the first film", links: [] },
];

const renderSection = (props = {}) =>
  render(
    <TextLinksSection
      section={EASTER_EGGS}
      notes={ROWS}
      canWrite
      onCreate={() => {}}
      onUpdate={() => {}}
      onDelete={() => {}}
      onReorder={() => {}}
      {...props}
    />,
  );

const popup = () =>
  screen.getByRole("dialog", { name: "Add to 彩蛋/致敬 Easter Eggs/References" });

it("opens the draft in a non-modal dialog outside the card, focused", async () => {
  const { container } = renderSection();
  expect(screen.queryByRole("dialog")).toBeNull();

  await userEvent.click(screen.getByRole("button", { name: "Add" }));

  const dialog = popup();
  expect(dialog).toHaveAttribute("aria-modal", "false");
  // Portalled: not inside the section's card.
  expect(container.contains(dialog)).toBe(false);
  expect(dialog.contains(document.activeElement)).toBe(true);
});

it("leaves the page usable while open: the rows stay, and pressing them keeps the draft", async () => {
  renderSection();
  await userEvent.click(screen.getByRole("button", { name: "Add" }));
  const body = within(popup()).getByPlaceholderText(/Description/);
  await userEvent.type(body, "half written");

  // The saved row is still on the page, and pressing it or Escape does not
  // close the popup or lose what was typed.
  const row = screen.getByText("A nod to the first film");
  await userEvent.click(row);
  await userEvent.keyboard("{Escape}");
  expect(within(popup()).getByPlaceholderText(/Description/)).toHaveValue("half written");
});

it("saves through the section's onCreate and closes", async () => {
  const onCreate = vi.fn();
  renderSection({ onCreate });
  await userEvent.click(screen.getByRole("button", { name: "Add" }));
  await userEvent.type(within(popup()).getByPlaceholderText(/Description/), "New one");
  await userEvent.click(within(popup()).getByRole("button", { name: "Save" }));

  expect(onCreate).toHaveBeenCalledTimes(1);
  expect(onCreate.mock.calls[0][0]).toMatchObject({ section: "easter_eggs", content: "New one" });
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("discards the draft from its × as Cancel does", async () => {
  const onCreate = vi.fn();
  renderSection({ onCreate });
  await userEvent.click(screen.getByRole("button", { name: "Add" }));
  await userEvent.type(within(popup()).getByPlaceholderText(/Description/), "gone");
  await userEvent.click(within(popup()).getByRole("button", { name: "Close" }));

  expect(screen.queryByRole("dialog")).toBeNull();
  expect(onCreate).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Add" }));
  expect(within(popup()).getByPlaceholderText(/Description/)).toHaveValue("");
});

it("steps a second open popup off the first, and moves one by its header", () => {
  const first_ = (
    <DraftPopup key="1" title="First" onClose={() => {}}>
      <input aria-label="a" />
    </DraftPopup>
  );
  const { rerender } = render(<>{first_}</>);
  rerender(
    <>
      {first_}
      <DraftPopup key="2" title="Second" onClose={() => {}}>
        <input aria-label="b" />
      </DraftPopup>
    </>,
  );
  const first = screen.getByRole("dialog", { name: "First" });
  const second = screen.getByRole("dialog", { name: "Second" });
  expect(first.style.right).toBe("16px");
  expect(second.style.right).toBe("40px");

  const header = within(first).getByText("First").parentElement;
  fireEvent.pointerDown(header, { button: 0, clientX: 10, clientY: 10 });
  fireEvent.pointerMove(window, { clientX: 110, clientY: 60 });
  fireEvent.pointerUp(window);
  expect(first.style.left).toBe("100px");
  expect(first.style.top).toBe("50px");
  expect(first.style.right).toBe("");
});
