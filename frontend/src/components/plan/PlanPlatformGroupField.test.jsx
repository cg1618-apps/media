// A game's platform group, set from its detail page: drawn while the viewer
// has the game queued next, and writing the same plan row the Plan page's
// picker does.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import PlanPlatformGroupField from "./PlanPlatformGroupField";

const ROWS = [
  // The game's own next row - the one the picker writes.
  {
    system_id: "row-next",
    kind: "next",
    media_type: "game",
    scope: "entry",
    target_id: "g1",
    display_name: "Hades",
    platform_group: "PC",
  },
  // Another game's row, and this game's replay mark: neither is picked.
  { system_id: "row-other", kind: "next", media_type: "game", scope: "entry", target_id: "g2" },
  { system_id: "row-replay", kind: "rewatch", media_type: "game", scope: "entry", target_id: "g1" },
];

function stubFetch() {
  const spy = vi.fn((url, options) =>
    Promise.resolve(
      new Response(JSON.stringify(options?.method === "PATCH" ? {} : ROWS), { status: 200 }),
    ),
  );
  vi.stubGlobal("fetch", spy);
  return spy;
}

function mount(props) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PlanPlatformGroupField mediaType="game" {...props} />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("PlanPlatformGroupField", () => {
  it("shows the queued game's group and PATCHes its next row", async () => {
    const user = userEvent.setup();
    const fetchSpy = stubFetch();
    mount({ entryId: "g1", queued: true });
    const select = await screen.findByRole("combobox", { name: /platform group for hades/i });
    expect(select).toHaveValue("PC");
    await user.selectOptions(select, "Switch");
    const patch = fetchSpy.mock.calls.find(([, options]) => options?.method === "PATCH");
    expect(patch[0]).toBe("/api/plan-next/row-next");
    expect(JSON.parse(patch[1].body)).toEqual({ platform_group: "Switch" });
  });

  it("draws nothing for a game that is not queued, and asks for no rows", () => {
    const fetchSpy = stubFetch();
    mount({ entryId: "g1", queued: false });
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("draws nothing while the queued game has no next row", async () => {
    // g3 has no row at all; the replay row of g1 must not stand in for one.
    const fetchSpy = stubFetch();
    mount({ entryId: "g3", queued: true });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
