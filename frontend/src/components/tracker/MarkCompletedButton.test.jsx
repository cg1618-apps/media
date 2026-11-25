// Frontend: the detail pages' Mark completed button. It is drawn only while
// the entry is not finished by its type's own status field
// (MEDIA_CONFIG[type].statusField), so each case below sets that field - a
// status on some other field would hide nothing.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import MarkCompletedButton from "./MarkCompletedButton";

describe("MarkCompletedButton", () => {
  it.each([
    ["anime", { watching_status: "Completed" }],
    ["hentai", { watching_status: "Completed (解說)" }],
    ["manga", { reading_status: "Completed" }],
    ["h-comic", { reading_status: "Completed" }],
    ["game", { playing_status: "Completed" }],
    ["h-game", { playing_status: "Completed" }],
  ])("renders nothing for a completed %s", (type, entry) => {
    const { container } = render(
      <MarkCompletedButton type={type} entry={entry} onClick={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ["anime", { watching_status: "Active Watching" }],
    ["book", { reading_status: "Active Reading" }],
    ["game", { playing_status: null }],
    // Completed on a field the type does not track by: still not finished.
    ["game", { reading_status: "Completed" }],
  ])("is drawn for an unfinished %s, and calls onClick", async (type, entry) => {
    const onClick = vi.fn();
    render(<MarkCompletedButton type={type} entry={entry} onClick={onClick} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Mark completed" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
