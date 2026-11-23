// Frontend: the Do next tab's platform groups for games.
//
// A game's bucket is its plan row's own platform_group, so the Game tab draws
// one heading per group in PLATFORM_GROUPS order and the rows with none
// under "Ungrouped". Each game card carries a picker that PATCHes the row.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import PlanWatchNext from "./PlanWatchNext";
import PlanNextCard from "./PlanNextCard";
import { groupByBucket, entryBucket } from "../../utils/planNext";

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ has: () => true, user: { username: "u" } }),
}));

function game(id, name, platformGroup) {
  return {
    system_id: id,
    kind: "next",
    media_type: "game",
    scope: "entry",
    target_id: `t-${id}`,
    display_name: name,
    nav_path: "/game",
    missing: false,
    platform_group: platformGroup,
    bucket: entryBucket("game", platformGroup, null, null),
  };
}

function renderWith(ui) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("a game's platform group", () => {
  it("buckets on the row's own group, and an unknown or missing one is ungrouped", () => {
    expect(entryBucket("game", "Switch", null, null)).toBe("Switch");
    expect(entryBucket("game", null, null, null)).toBeNull();
    expect(entryBucket("game", "Steam Deck", null, null)).toBeNull();
    const grouped = groupByBucket(
      [game("a", "A", "PC"), game("b", "B", null)],
      "game",
    );
    expect(grouped.PC.map((r) => r.display_name)).toEqual(["A"]);
    expect(grouped.ungrouped.map((r) => r.display_name)).toEqual(["B"]);
  });

  it("draws the Game tab one platform at a time, ungrouped last", async () => {
    const user = userEvent.setup();
    renderWith(
      <PlanWatchNext
        planRows={[
          game("a", "Elden Ring", null),
          game("b", "Zelda", "Switch"),
          game("c", "Hades", "PC"),
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Game" }));
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(["PC", "Switch", "Ungrouped"]);
  });

  it("PATCHes the row when a group is picked", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    renderWith(<PlanNextCard row={game("a", "Elden Ring", null)} />);
    const select = screen.getByRole("combobox", { name: /platform group for elden ring/i });
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Ungrouped",
      "PC",
      "Console",
      "Handheld Console",
      "Switch",
    ]);
    await user.selectOptions(select, "Handheld Console");
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/plan-next/a");
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(options.body)).toEqual({ platform_group: "Handheld Console" });
  });

  it("gives no picker to a non-game card", () => {
    renderWith(
      <PlanNextCard row={{ ...game("m", "Heat", null), media_type: "movie", nav_path: "/movie" }} />,
    );
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
