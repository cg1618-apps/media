// Frontend: the h-game form.
//
// Game's form reshaped for h_game: the fields h_game lacks are not offered,
// its own are, the franchise and base-game pickers offer h-game rows only,
// and the multi-choice lists keep "none" and "not recorded" apart in form
// state. The Modify tab renders the same body, so this pins both.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import HGameAddTab from "./HGameAddTab";
import { defaultHGame } from "../../config/formFactories";

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ has: () => true, visibleGatedTypes: ["h-game"] }),
}));

const SOURCES = { options: [], studios: [], publishers: {}, people: {} };

// The form state the harness last committed, read by the assertions.
let latest;
const record = (form) => {
  latest = form;
};

function Harness({ franchises = [], hGames = [], entries, onPick = () => {} }) {
  const [form, setForm] = useState(defaultHGame());
  useEffect(() => record(form), [form]);
  return (
    <HGameAddTab
      franchiseCollections={{}}
      hgf={form}
      uhg={(k, v) => setForm((p) => ({ ...p, [k]: v }))}
      allFranchises={franchises}
      allHGames={entries ?? hGames}
      seriesItemsForHGame={[]}
      sources={SOURCES}
      applyHGameAutofill={() => {}}
      applyHGameEntryAutofill={onPick}
    />
  );
}

function renderTab(props) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Harness {...props} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  latest = undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }))
  );
});

describe("HGameAddTab", () => {
  it("offers h-game's fields and none of the ones h_game lacks", () => {
    renderTab();
    for (const label of ["Play Style", "Language", "Animation", "All CG", "Usefulness"]) {
      expect(screen.getByRole("combobox", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("group", { name: "Audio" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "H 演出形式" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Platform" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "DLsite Link (JP)" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "DLsite Link (TW)" })).toBeInTheDocument();
    for (const gone of [
      /Hours Played/,
      /Metacritic/,
      /All Achievements/,
      /All Collected/,
      /Publisher/,
      /Director/,
      /Composer/,
    ]) {
      expect(screen.queryByText(gone)).toBeNull();
    }
  });

  it("keeps an untouched list null and sets [] only when None is chosen", async () => {
    const user = userEvent.setup();
    renderTab();
    expect(latest.platform).toBeNull();
    const platform = screen.getByRole("group", { name: "Platform" });
    await user.click(within(platform).getByRole("button", { name: "None" }));
    expect(latest.platform).toEqual([]);
    await user.click(within(platform).getByRole("button", { name: "DLsite" }));
    expect(latest.platform).toEqual(["DLsite"]);
    // The other lists were never touched.
    expect(latest.audio_availability).toBeNull();
    expect(latest.h_presentation).toBeNull();
    expect(latest.art_style).toBeNull();
  });

  it("offers only H-Game franchises", async () => {
    const user = userEvent.setup();
    renderTab({
      franchises: [
        { system_id: "f1", franchise_name_en: "Plain Game Line", franchise_type: "Game" },
        { system_id: "f2", franchise_name_en: "Adult Game Line", franchise_type: "H-Game" },
      ],
    });
    await user.click(screen.getByPlaceholderText("Search or type new franchise..."));
    expect(await screen.findByText("Adult Game Line")).toBeInTheDocument();
    expect(screen.queryByText("Plain Game Line")).toBeNull();
  });
});

describe("HGameAddTab - auto-fill from an existing entry", () => {
  it("offers the existing h-games and hands the picked one over", async () => {
    // The second entry proves the box filters rather than listing everything.
    const onPick = vi.fn();
    const entries = [
      { system_id: "e1", h_game_name_cn: "既有條目", franchise_id: null },
      { system_id: "e2", h_game_name_cn: "其他", franchise_id: null },
    ];
    renderTab({ entries, onPick });

    await userEvent.type(
      screen.getByRole("textbox", { name: "Auto-fill from existing entry" }),
      "既有",
    );
    expect(screen.queryByRole("button", { name: /其他/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /既有條目/ }));

    expect(onPick).toHaveBeenCalledWith(entries[0]);
  });
});
