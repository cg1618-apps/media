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

function Harness({ franchises = [], initial = {} }) {
  const [form, setForm] = useState({ ...defaultHComic(), ...initial });
  return (
    <HComicAddTab
      franchiseCollections={{}}
      hcf={form}
      uhc={(k, v) => setForm((p) => ({ ...p, [k]: v }))}
      allFranchises={franchises}
      seriesItemsForHComic={[]}
      sources={SOURCES}
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
});
