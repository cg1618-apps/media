// Frontend: an open Modify editor names its record in the browser tab.
//
// "✎ <name>", the pencil keeping it apart from the record's own page; with no
// editor open the route's "Modify Entry" stands. Rendered inside the real
// PageTitleProvider, the only writer of document.title.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Modify from "./Modify";
import { PageTitleProvider } from "../../contexts/PageTitleContext";
import * as notesApi from "../notes/api";

vi.mock("../notes/api");
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    has: () => true,
    visibleGatedTypes: [],
    user: { username: "cg1618" },
    modes: [],
  }),
}));

const ok = (body) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

const FRANCHISE = {
  system_id: "c1",
  franchise_name_cn: "復仇者聯盟",
  franchise_name_en: "Avengers",
  franchise_type: "Anime",
};

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/modify?type=franchise&id=c1"]}>
        <PageTitleProvider>
          <Modify />
        </PageTitleProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(notesApi.fetchSections).mockResolvedValue([]);
  vi.mocked(notesApi.fetchNotes).mockResolvedValue([]);
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal(
    "fetch",
    vi.fn((url, options = {}) => {
      const u = String(url);
      if ((options.method || "GET") === "GET" && u.startsWith("/api/franchise/?"))
        return ok([FRANCHISE]);
      return ok([]);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Modify - the browser tab", () => {
  it("names the record the editor is open on, and drops it on Back", async () => {
    const user = userEvent.setup();
    mount();

    // The editor's own heading label: the CN name before the EN one.
    expect(await screen.findByDisplayValue("Avengers")).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe("✎ 復仇者聯盟"));

    await user.click(screen.getByRole("button", { name: /Back/ }));
    await waitFor(() => expect(document.title).toBe("Modify Entry"));
  });
});
