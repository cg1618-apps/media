// Frontend: the Add page hands every entry tab the loaded franchises and
// series, and the tab's lineage pickers narrow both to the type's rule
// (FamilyLineageFields). This guards the page's half of that: the series it
// passes carry their parent franchise, so the Series picker can drop the ones
// under an out-of-scope franchise before any franchise is picked. The Movie
// franchise and its series are what make the anime refusal bite.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Add from "./Add";
import * as notesApi from "../notes/api";

vi.mock("../notes/api");
vi.mock("../../hooks/useToast", () => ({ useToast: () => ({ showToast: vi.fn() }) }));

const FRANCHISES = [
  { system_id: "f-anime", franchise_name_en: "Anime Saga", franchise_type: "Anime" },
  { system_id: "f-movie", franchise_name_en: "Heist Films", franchise_type: "Movie" },
];
const SERIES = [
  { system_id: "s-anime", series_name_en: "Anime Arc", franchise_id: "f-anime" },
  { system_id: "s-movie", series_name_en: "Heist Trilogy", franchise_id: "f-movie" },
];

function respond(body) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
}

beforeEach(() => {
  vi.mocked(notesApi.fetchSections).mockResolvedValue([]);
  vi.mocked(notesApi.fetchNotes).mockResolvedValue([]);
  vi.stubGlobal(
    "fetch",
    vi.fn((url, options = {}) => {
      const u = String(url);
      if ((options.method || "GET") === "GET") {
        if (u.startsWith("/api/franchise/")) return respond(FRANCHISES);
        if (u.startsWith("/api/series/")) return respond(SERIES);
      }
      return respond([]);
    }),
  );
});

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Add />
    </QueryClientProvider>,
  );
}

describe("Add page - lineage pickers in scope", () => {
  it("offers anime, before a franchise is picked, only series under an Anime franchise", async () => {
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

    await user.click(screen.getByRole("combobox", { name: "Franchise" }));
    expect(await screen.findByRole("option", { name: "Anime Saga" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Heist Films" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Series" }));
    expect(await screen.findByRole("option", { name: "Anime Arc" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Heist Trilogy" })).not.toBeInTheDocument();
  });
});
