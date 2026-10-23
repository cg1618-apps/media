// Frontend: the Add form's Game tab - its two search boxes and its form.
//
// The top box copies fields from a game already in the catalogue; the IGDB
// box under it is the shared ExternalSearchBox (tested on its own), pointed
// at the game endpoint. IGDB is the only handle Fill has on a game, so the
// admin links the right entry here before saving.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GameAddTab from "./GameAddTab";
import { defaultGame } from "../../config/formFactories";

// The form asks who is editing, because the Copies section is gated on
// self.list - a copy is personal ownership, not catalogue data. These tests
// are about the search boxes, so the account is whatever is convenient; the
// gate itself is tested in GameCopiesGate.test.jsx.
let mockHas = () => true;
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ has: mockHas }),
}));

const ELDEN = {
  external_id: "119133",
  link: "https://www.igdb.com/games/elden-ring",
  title: "Elden Ring",
  title_alt: null,
  year: 2022,
  detail: "Main game",
  cover_url: "https://images.igdb.com/igdb/image/upload/t_thumb/co4jni.jpg",
};

const SEKIRO = {
  system_id: "g1",
  game_name_cn: "隻狼",
  game_name_en: "Sekiro",
  franchise_id: null,
};

// The Cover Image field is now an ImagePicker, which reads react-query hooks
// even before anything is uploaded - every render needs a QueryClientProvider.
function renderTab(props = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GameAddTab
        franchiseCollections={{}}
        gmf={defaultGame()}
        ugm={() => {}}
        allFranchises={[]}
        allGames={[SEKIRO]}
        seriesItemsForGame={[]}
        sources={[]}
        applyGameEntryAutofill={() => {}}
        applyIgdbPick={() => {}}
        {...props}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([ELDEN]) }),
    ),
  );
});

describe("GameAddTab search boxes", () => {
  it("copies fields from an existing game through the top box", async () => {
    const user = userEvent.setup();
    const applyGameEntryAutofill = vi.fn();
    renderTab({ applyGameEntryAutofill });
    await user.type(
      screen.getByRole("textbox", { name: "Auto-fill from existing entry" }),
      "seki",
    );
    await user.click(screen.getByRole("option", { name: /隻狼/ }));
    expect(applyGameEntryAutofill).toHaveBeenCalledWith(SEKIRO);
    // The existing-entry box searches the loaded list; nothing is fetched.
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("searches the game IGDB endpoint and hands the picked row to applyIgdbPick", async () => {
    const user = userEvent.setup();
    const applyIgdbPick = vi.fn();
    renderTab({ applyIgdbPick });
    await user.type(screen.getByRole("textbox", { name: "Search IGDB" }), "elden");
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/game/search-igdb?q=elden&limit=10",
        expect.objectContaining({ credentials: "include" }),
      ),
    );
    await user.click(await screen.findByRole("option", { name: /Elden Ring/ }));
    expect(applyIgdbPick).toHaveBeenCalledWith(ELDEN);
  });
});

describe("GameAddTab is_main", () => {
  it("offers the game-only Main / Remake / Remaster, starting on Main", () => {
    renderTab();
    const select = screen.getByRole("combobox", { name: "Main / Remake" });
    expect(select).toHaveValue("Main");
    const values = [...select.options].map((o) => o.value);
    expect(values).toEqual(["", "Main", "Remake", "Remaster"]);
  });
});

// The form's layout, read off the DOM: section headers carry
// data-form-section, and each field's label is a <label> under the last
// header before it.
const sectionTitles = (container) =>
  [...container.querySelectorAll("[data-form-section]")].map((el) =>
    el.getAttribute("data-form-section"),
  );
const labelsBySection = (container) => {
  const out = {};
  let current = null;
  for (const el of container.querySelectorAll("[data-form-section], label")) {
    if (el.hasAttribute("data-form-section")) {
      current = el.getAttribute("data-form-section");
      out[current] = [];
    } else if (current) {
      out[current].push(el.textContent.trim());
    }
  }
  return out;
};

describe("GameAddTab layout", () => {
  it("renders the canonical sections in order", () => {
    const { container } = renderTab();
    expect(sectionTitles(container)).toEqual([
      "Titles & Naming",
      "Scores",
      "My Tracker",
      "Information",
      "Genres & Labels",
      "Production",
      "Prices",
      "Copies",
      "Links & Sources",
      "Cover & Remark",
    ]);
  });

  it("lists the names CN first, with Romaji beside JP", () => {
    const { container } = renderTab();
    const names = labelsBySection(container)["Titles & Naming"].filter((l) =>
      l.startsWith("Game Name"),
    );
    expect(names).toEqual([
      "Game Name CN",
      "Game Name EN",
      "Game Name Romaji",
      "Game Name JP",
      "Game Name Alt",
    ]);
  });

  it("puts the release date under Information and keeps Prices to prices", () => {
    const { container } = renderTab();
    const sections = labelsBySection(container);
    expect(sections["Information"]).toContain("Release Date");
    expect(sections["Prices"]).toEqual([
      "MSRP (US)",
      "MSRP (JP)",
      "MSRP (TW)",
      "Current Price (US)",
      "Current Price (JP)",
      "Current Price (TW)",
    ]);
  });

  it("ends My Tracker with the plan flags", () => {
    const { container } = renderTab();
    const tracker = labelsBySection(container)["My Tracker"];
    expect(tracker.slice(0, 2)).toEqual(["Playing Status", "My Rating"]);
    expect(tracker.slice(-4)).toEqual([
      "Play Next",
      "Add to Play Next list",
      "To Replay",
      "Mark for replay",
    ]);
  });
});
