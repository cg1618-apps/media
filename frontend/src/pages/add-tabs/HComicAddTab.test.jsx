// Frontend: the h-comic form follows its region.
//
// Region is asked first; until it is chosen only the fields both regions
// share are offered, and choosing one reveals that region's own fields
// (lib/hComicRegion.js). The Modify tab renders the same body, so this pins
// both.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import HComicAddTab from "./HComicAddTab";
import { defaultHComic } from "../../config/formFactories";

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ has: () => true, visibleGatedTypes: ["h-comic"] }),
}));

const SOURCES = { options: [], studios: [], publishers: {}, people: {} };

// Platform values as the migration leaves them: the h-comic storefronts
// (watch) and publishers (origin) scoped to h-comic, and Prime Video scoped
// to the watched types.
const PLATFORM_SOURCES = {
  ...SOURCES,
  options: [
    { category: "Platform", value: "Prime Video", scopes: ["anime", "movie"], usages: [] },
    { category: "Platform", value: "DLsite TW", scopes: ["h-comic"], usages: ["watch"] },
    { category: "Platform", value: "Toptoon KR", scopes: ["h-comic"], usages: ["watch"] },
    { category: "Platform", value: "DLsite", scopes: ["h-comic"], usages: ["origin"] },
    { category: "Platform", value: "Toptoon", scopes: ["h-comic"], usages: ["origin"] },
    { category: "Reference Source", value: "Official site", scopes: ["h-comic"], usages: [] },
    { category: "Reference Source", value: "Twitter", scopes: ["h-comic"], usages: [] },
    { category: "Reference Source", value: "SteamDB", scopes: ["game"], usages: [] },
  ],
};

function Harness({ franchises = [], initial = {}, sources = SOURCES, entries = [], onPick = () => {} }) {
  const [form, setForm] = useState({ ...defaultHComic(), ...initial });
  return (
    <HComicAddTab
      franchiseCollections={{}}
      hcf={form}
      uhc={(k, v) => setForm((p) => ({ ...p, [k]: v }))}
      allFranchises={franchises}
      allHComics={entries}
      applyHComicEntryAutofill={onPick}
      seriesItemsForHComic={[]}
      sources={sources}
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
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }))
  );
});

const field = (label) =>
  screen.queryByRole("spinbutton", { name: label }) ??
  screen.queryByRole("combobox", { name: label }) ??
  screen.queryByRole("textbox", { name: label });

describe("HComicAddTab", () => {
  it("offers no region-only field until a region is chosen", () => {
    renderTab();
    expect(field("Region")).toBeInTheDocument();
    expect(field("H-Comic Name EN")).toBeInTheDocument();
    for (const label of ["Page Total", "Chapter Total", "Originality", "H-Comic Name KR"]) {
      expect(field(label), label).toBeNull();
    }
  });

  it("shows the JP fields on JP", async () => {
    const user = userEvent.setup();
    renderTab();
    await user.selectOptions(field("Region"), "JP");
    for (const label of [
      "Page Total",
      "Pages Read",
      "Series Number",
      "Originality",
      "Animation Status",
      "H-Comic Name JP",
    ]) {
      expect(field(label), label).toBeInTheDocument();
    }
    for (const label of ["Chapter Total", "Chapters Behind Official", "H-Comic Name KR"]) {
      expect(field(label), label).toBeNull();
    }
    expect(screen.queryByText("Official Source")).toBeNull();
    expect(screen.queryByText("Author")).toBeNull();
  });

  it("shows the KR fields on KR", async () => {
    const user = userEvent.setup();
    renderTab();
    await user.selectOptions(field("Region"), "KR");
    for (const label of [
      "Chapter Total",
      "Chapters Read",
      "Chapters Behind Official",
      "H-Comic Name KR",
    ]) {
      expect(field(label), label).toBeInTheDocument();
    }
    for (const label of ["Page Total", "Originality", "Animation Status", "Series Number"]) {
      expect(field(label), label).toBeNull();
    }
    expect(screen.getByText("Official Source")).toBeInTheDocument();
    expect(screen.getByText("Author")).toBeInTheDocument();
  });

  it("offers a hand-set animation status as a select", () => {
    renderTab({
      initial: { region: "JP", animation_status: "Announced", animation_status_source: "manual" },
    });
    expect(screen.getByRole("combobox", { name: "Animation Status" })).toHaveValue("Announced");
  });

  it("shows a derived animation status read-only, with where it comes from", () => {
    // The mirror of the case above: same region, same value, only the source
    // differs - so the missing select is the derivation's doing.
    renderTab({
      initial: { region: "JP", animation_status: "Animated", animation_status_source: "derived" },
    });
    expect(screen.queryByRole("combobox", { name: "Animation Status" })).toBeNull();
    const input = screen.getByRole("textbox", { name: "Animation Status" });
    expect(input).toHaveValue("Animated");
    expect(input).toBeDisabled();
    expect(screen.getByText(/Derived from a linked hentai adaptation/)).toBeInTheDocument();
  });

  it("offers only the h-comic family's franchises", async () => {
    const user = userEvent.setup();
    renderTab({
      franchises: [
        { system_id: "f1", franchise_name_en: "Mainstream Fate", franchise_type: "ACG" },
        { system_id: "f2", franchise_name_en: "Adult Fate", franchise_type: "H-Comic" },
        // The same family: an h-comic may share its hentai adaptation's.
        { system_id: "f3", franchise_name_en: "Adult Anime", franchise_type: "Hentai" },
      ],
    });
    await user.click(screen.getByPlaceholderText("Search or type new franchise..."));
    expect(screen.getByText("Adult Fate")).toBeInTheDocument();
    expect(screen.getByText("Adult Anime")).toBeInTheDocument();
    expect(screen.queryByText("Mainstream Fate")).toBeNull();
  });

  describe("sources", () => {
    const restrictedNames = () =>
      screen
        .queryAllByRole("combobox", { name: "Restricted Sources name" })
        .map((input) => input.value);
    const KR_ONLY = ["污汙漫畫", "漫小肆ikanhm", "ToonGod", "Anime Planet", "MANGA18", "MANGADNA"];

    it("starts with 禁漫天堂 and follows the region with the KR sources", async () => {
      const user = userEvent.setup();
      renderTab();
      expect(restrictedNames()).toEqual(["禁漫天堂"]);
      await user.selectOptions(field("Region"), "KR");
      expect(restrictedNames()).toEqual(["禁漫天堂", ...KR_ONLY]);
      await user.selectOptions(field("Region"), "JP");
      expect(restrictedNames()).toEqual(["禁漫天堂"]);
    });

    it("offers the h-comic platforms as main sources, and not Prime Video", async () => {
      const user = userEvent.setup();
      renderTab({ sources: PLATFORM_SOURCES });
      await user.click(screen.getByRole("button", { name: /add main source/i }));
      await user.click(screen.getByRole("button", { name: /add reference source/i }));
      const [main, reference] = screen
        .getAllByRole("combobox")
        .filter((el) => el.tagName === "SELECT" && [...el.options].some((o) => o.value === "DLsite TW" || o.value === "Twitter"));
      const values = (select) => [...select.options].map((o) => o.value).filter(Boolean);
      expect(values(main)).toEqual(["DLsite TW", "Toptoon KR"]);
      expect(values(reference)).toEqual(["Official site", "Twitter"]);
    });

    it("offers the publishers, not the storefronts, as a KR entry's Official Source", async () => {
      const user = userEvent.setup();
      renderTab({ sources: PLATFORM_SOURCES });
      await user.selectOptions(field("Region"), "KR");
      await user.click(screen.getByPlaceholderText("Select or type platform..."));
      expect(screen.getByRole("button", { name: "DLsite" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Toptoon" })).toBeInTheDocument();
      for (const name of ["DLsite TW", "Toptoon KR", "Prime Video"]) {
        expect(screen.queryByRole("button", { name }), name).toBeNull();
      }
    });

    it("asks for the MAL link and shows the id read-only", () => {
      renderTab({ initial: { mal_link: "https://myanimelist.net/manga/777", mal_id: 777 } });
      expect(field("MAL Link")).toHaveValue("https://myanimelist.net/manga/777");
      expect(field("MAL ID")).toHaveValue("777");
      expect(field("MAL ID")).toBeDisabled();
    });
  });
});

describe("HComicAddTab - auto-fill from an existing entry", () => {
  it("offers the existing h-comics and hands the picked one over", async () => {
    // The second entry proves the box filters rather than listing everything.
    const onPick = vi.fn();
    const entries = [
      { system_id: "e1", h_comic_name_cn: "既有條目", franchise_id: null },
      { system_id: "e2", h_comic_name_cn: "其他", franchise_id: null },
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
