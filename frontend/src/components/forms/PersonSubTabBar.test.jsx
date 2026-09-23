import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import PersonSubTabBar, { PERSON_SUB_TABS } from "./PersonSubTabBar";

// The Club tab is the gated h-comic type's: drawn only for a session whose
// /api/auth/me names the type.
const auth = { visibleGatedTypes: [] };
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => auth }));

describe("PersonSubTabBar", () => {
  it("offers exactly the seven person types", () => {
    expect(PERSON_SUB_TABS.map((t) => t.key)).toEqual([
      "director",
      "producer",
      "composer",
      "author",
      "illustrator",
      "club",
      "seiyuu",
    ]);
  });

  it("labels composer as it reads in the forms", () => {
    expect(PERSON_SUB_TABS.find((t) => t.key === "composer").label).toBe(
      "Music / Composer",
    );
  });

  it("marks the active tab and calls back on select", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PersonSubTabBar active="author" onSelect={onSelect} />);

    const author = screen.getByRole("button", { name: /Author/ });
    expect(author.className).toContain("border-brand");

    await user.click(screen.getByRole("button", { name: /Director/ }));
    expect(onSelect).toHaveBeenCalledWith("director");
  });

  it("draws the Club tab only for a session that can see h-comic", () => {
    auth.visibleGatedTypes = [];
    const { unmount } = render(<PersonSubTabBar active="director" onSelect={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Club/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Illustrator/ })).toBeInTheDocument();
    unmount();

    auth.visibleGatedTypes = ["h-comic"];
    render(<PersonSubTabBar active="director" onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Club/ })).toBeInTheDocument();
    auth.visibleGatedTypes = [];
  });
});
