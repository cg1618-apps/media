// The Modify page's System Option editor. A common option's scope belongs to
// its category (COMMON_OPTION_SCOPES in app/utils/credit_roles.py), so the
// editor shows no scope picker for one; every other category keeps it.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import OptionsModifyTab from "./OptionsModifyTab";

function renderTab(category) {
  return render(
    <OptionsModifyTab
      editingItem={{ system_id: "o1", category, value: "v" }}
      optValue="v"
      setOptValue={vi.fn()}
      optScopes={["anime"]}
      setOptScopes={vi.fn()}
      optUsages={[]}
      setOptUsages={vi.fn()}
      optAliases={[]}
      setOptAliases={vi.fn()}
    />,
  );
}

describe("OptionsModifyTab", () => {
  it("offers a scope picker for an ordinary option and a tag", () => {
    for (const category of ["Game Genre", "Genre Main"]) {
      const { unmount } = renderTab(category);
      expect(screen.getByText("Scopes")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "anime" })).toBeInTheDocument();
      unmount();
    }
  });

  it("shows no scope picker for a common option", () => {
    for (const category of ["Song Type", "Country", "Needs Work Note"]) {
      const { unmount } = renderTab(category);
      expect(screen.queryByText("Scopes")).toBeNull();
      expect(screen.queryByRole("button", { name: "anime" })).toBeNull();
      unmount();
    }
  });
});
