// The confirmation an entry's save shows before it creates a franchise or a
// series: the names that will be used, editable, and the franchise's types.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import GroupCreateModal from "./GroupCreateModal";

const NAMES = { en: "Frieren", cn: "芙莉蓮", roman: "", jp: "", alt: "" };
const OFFERED = ["Anime", "Manga", "Game"];

function mount(props = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <GroupCreateModal
      franchise={{ names: NAMES, types: [], lockedTypes: ["Anime"] }}
      series={{ names: { ...NAMES, cn: "" }, text: "Frieren S1" }}
      franchiseTypes={OFFERED}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onConfirm, onCancel };
}

describe("GroupCreateModal", () => {
  it("shows the names that will be used, as editable fields", () => {
    mount();
    expect(screen.getByRole("dialog", { name: "Create new franchise and series" })).toBeInTheDocument();
    expect(screen.getByLabelText("Franchise name EN")).toHaveValue("Frieren");
    expect(screen.getByLabelText("Franchise name CN")).toHaveValue("芙莉蓮");
    expect(screen.getByLabelText("Series name EN")).toHaveValue("Frieren");
    expect(screen.getByLabelText("Series name CN")).toHaveValue("");
    expect(screen.getByText("Frieren S1")).toBeInTheDocument();
  });

  it("keeps the implied type ticked and lets more be added", async () => {
    const user = userEvent.setup();
    mount();
    const anime = screen.getByRole("checkbox", { name: "Anime" });
    expect(anime).toBeChecked();
    expect(anime).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Manga" })).not.toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "Manga" }));
    expect(screen.getByRole("checkbox", { name: "Manga" })).toBeChecked();
  });

  it("hands back the edited names and the chosen types", async () => {
    const user = userEvent.setup();
    const { onConfirm } = mount();
    await user.clear(screen.getByLabelText("Franchise name EN"));
    await user.type(screen.getByLabelText("Franchise name EN"), "Frieren Franchise");
    await user.type(screen.getByLabelText("Series name JP"), "フリーレン");
    await user.click(screen.getByRole("checkbox", { name: "Game" }));
    await user.click(screen.getByRole("checkbox", { name: "Manga" }));
    await user.click(screen.getByRole("button", { name: "Create and proceed" }));
    expect(onConfirm).toHaveBeenCalledWith({
      franchise: {
        names: { ...NAMES, en: "Frieren Franchise" },
        types: ["Anime", "Manga", "Game"],
      },
      series: { names: { ...NAMES, cn: "", jp: "フリーレン" } },
    });
  });

  it("asks only about the series when the franchise exists", () => {
    mount({ franchise: null });
    expect(screen.getByRole("dialog", { name: "Create new series" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Franchise name EN")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("will not confirm a group with every name blank", async () => {
    const user = userEvent.setup();
    const { onConfirm } = mount({ series: null });
    await user.clear(screen.getByLabelText("Franchise name EN"));
    await user.clear(screen.getByLabelText("Franchise name CN"));
    expect(screen.getByRole("button", { name: "Create and proceed" })).toBeDisabled();
    await user.type(screen.getByLabelText("Franchise name Alt"), "F");
    await user.click(screen.getByRole("button", { name: "Create and proceed" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cancels without handing anything back", async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = mount();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
