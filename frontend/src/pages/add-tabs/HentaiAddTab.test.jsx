// Frontend: the hentai form.
//
// One entry is one episode, so the form carries no progress; and it offers
// only franchises of the h-comic family, the ones the server lets a hentai
// sit in. The Modify tab renders the same body, so this pins both.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import HentaiAddTab from "./HentaiAddTab";
import { defaultHentai } from "../../config/formFactories";

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ has: () => true, visibleGatedTypes: ["h-comic", "hentai"] }),
}));

const SOURCES = { options: [], studios: [], publishers: {}, people: {} };

function Harness({ franchises = [] }) {
  const [form, setForm] = useState(defaultHentai());
  return (
    <HentaiAddTab
      franchiseCollections={{}}
      htf={form}
      uht={(k, v) => setForm((p) => ({ ...p, [k]: v }))}
      allFranchises={franchises}
      seriesItemsForHentai={[]}
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

describe("HentaiAddTab", () => {
  it("asks for the five names, hentai's classification and the watch axis", () => {
    renderTab();
    for (const label of [
      "Hentai Name CN",
      "Hentai Name EN",
      "Hentai Name Alt",
      "Hentai Name Roman",
      "Hentai Name JP",
      "Source Material",
      "Originality",
      "Series Number",
      "Airing Status",
      "Watching Status",
      "My Rating",
      "Usefulness",
      "MAL Link",
    ]) {
      expect(field(label), label).toBeInTheDocument();
    }
    expect(field("Watching Status")).toHaveValue("Might Watch");
    expect(screen.getByText("Studio")).toBeInTheDocument();
    expect(screen.getByText("Director")).toBeInTheDocument();
    expect(screen.getByText("Genre Relation")).toBeInTheDocument();
  });

  it("offers no progress and no MAL id", () => {
    renderTab();
    for (const label of ["Episodes Finished", "Total Episodes", "MAL ID", "Reading Status"]) {
      expect(field(label), label).toBeNull();
    }
  });

  it("offers a cast", () => {
    // The seiyuu column itself is CastEditor's, asserted in its own test.
    renderTab();
    expect(screen.getByText("Cast")).toBeInTheDocument();
  });

  it("offers the h-comic family's franchises and no mainstream one", async () => {
    const user = userEvent.setup();
    renderTab({
      franchises: [
        { system_id: "f1", franchise_name_en: "Mainstream Fate", franchise_type: "ACG" },
        { system_id: "f2", franchise_name_en: "Adult Fate", franchise_type: "H-Comic" },
        { system_id: "f3", franchise_name_en: "Adult Anime", franchise_type: "Hentai" },
      ],
    });
    await user.click(screen.getByPlaceholderText("Search or type new franchise..."));
    expect(screen.getByText("Adult Fate")).toBeInTheDocument();
    expect(screen.getByText("Adult Anime")).toBeInTheDocument();
    expect(screen.queryByText("Mainstream Fate")).toBeNull();
  });
});
