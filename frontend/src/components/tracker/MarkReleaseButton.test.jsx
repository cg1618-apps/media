// Frontend: the detail pages' release button and its details dialog.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import MarkReleaseButton from "./MarkReleaseButton";

function setup(type, entry) {
  const onPatch = vi.fn();
  render(<MarkReleaseButton type={type} entry={entry} title="Frieren" onPatch={onPatch} />);
  return { onPatch, user: userEvent.setup() };
}

describe("MarkReleaseButton", () => {
  it("renders nothing once there is no next step", () => {
    const { container } = render(
      <MarkReleaseButton type="anime" entry={{ airing_status: "Finished Airing" }} onPatch={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("asks for the missing details, then writes only what was filled", async () => {
    const { onPatch, user } = setup("anime", {
      airing_status: "Not Yet Aired",
      release_date: "2026-10",
    });
    await user.click(screen.getByRole("button", { name: "Mark airing" }));

    const dialog = screen.getByRole("dialog");
    expect(screen.queryByText("Release date")).not.toBeInTheDocument();
    expect(within(dialog).getByText("Broadcast day")).toBeInTheDocument();
    // Fields render in order: broadcast day, broadcast time, my watch day.
    await user.selectOptions(within(dialog).getAllByRole("combobox")[0], "Friday");
    await user.click(
      screen.getAllByRole("button", { name: "Mark airing" }).find((b) => dialog.contains(b)),
    );

    expect(onPatch).toHaveBeenCalledWith(
      { broadcast_day: "Friday", airing_status: "Airing" },
      "Marked as airing",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("confirms with every field left blank", async () => {
    const { onPatch, user } = setup("game", { release_status: "Unreleased" });
    await user.click(screen.getByRole("button", { name: "Mark released" }));
    const dialog = screen.getByRole("dialog");
    await user.click(
      screen.getAllByRole("button", { name: "Mark released" }).find((b) => dialog.contains(b)),
    );
    expect(onPatch).toHaveBeenCalledWith({ release_status: "Released" }, "Marked as released");
  });

  it("cancel writes nothing", async () => {
    const { onPatch, user } = setup("game", { release_status: "Unreleased" });
    await user.click(screen.getByRole("button", { name: "Mark released" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onPatch).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("writes at once when nothing is missing", async () => {
    const { onPatch, user } = setup("tv-show", {
      airing_status: "Not Yet Aired",
      release_date: "2026-10-03",
    });
    await user.click(screen.getByRole("button", { name: "Mark airing" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onPatch).toHaveBeenCalledWith({ airing_status: "Airing" }, "Marked as airing");
  });

  it("never asks on the finishing step", async () => {
    const { onPatch, user } = setup("anime", { airing_status: "Airing" });
    await user.click(screen.getByRole("button", { name: "Mark finished airing" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onPatch).toHaveBeenCalledWith(
      { airing_status: "Finished Airing" },
      "Marked as finished airing",
    );
  });
});
