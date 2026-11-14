// Frontend: what the Add page sends for a grouping tier.
//
// A rating and an expectation are the viewer's own, written through
// PUT /api/me/ratings from the group's page; the catalogue write carries
// neither. So the Franchise tab draws no rating or expectation input and its
// save sends no such key, and the franchise an entry's save quick-creates
// carries no expectation either.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Add from "./Add";
import * as notesApi from "../notes/api";

vi.mock("../notes/api");

vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

function json(body) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
}

function mockFetch() {
  return vi.fn((url, options = {}) => {
    const u = String(url);
    const method = options.method || "GET";
    if (u === "/api/franchise/" && method === "POST")
      return json({ system_id: "f-new", franchise_name_en: "New Franchise" });
    if (u === "/api/anime/" && method === "POST")
      return json({ system_id: "a-new", anime_name_en: "Test Anime" });
    return json([]);
  });
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Add />
    </QueryClientProvider>,
  );
}

const franchisePost = () =>
  fetch.mock.calls.find(
    ([url, opts]) => String(url) === "/api/franchise/" && opts?.method === "POST",
  );

beforeEach(() => {
  vi.mocked(notesApi.fetchSections).mockResolvedValue([]);
  vi.mocked(notesApi.fetchNotes).mockResolvedValue([]);
  vi.stubGlobal("fetch", mockFetch());
  vi.stubGlobal("scrollTo", vi.fn());
});

describe("Add page — a grouping tier carries no rating or expectation", () => {
  it("the Franchise tab offers neither, and its save sends neither", async () => {
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Structure" }));
    await user.click(screen.getByRole("button", { name: "Franchise" }));
    await user.type(
      await screen.findByPlaceholderText("English franchise name"),
      "New Franchise",
    );
    expect(screen.queryByText("My Rating")).not.toBeInTheDocument();
    expect(screen.queryByText("Expectation")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /append entry/i }));
    await waitFor(() => expect(franchisePost()).toBeTruthy());
    const body = JSON.parse(franchisePost()[1].body);
    expect(body.franchise_name_en).toBe("New Franchise");
    expect(body).not.toHaveProperty("my_rating");
    expect(body).not.toHaveProperty("franchise_expectation");
  });

  it("the franchise an anime's save quick-creates carries no expectation", async () => {
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());
    await user.type(screen.getByPlaceholderText("English title"), "Test Anime");
    // A franchise named but not picked: the save offers to create it.
    await user.type(
      screen.getByPlaceholderText("Search or type new franchise..."),
      "Brand New",
    );
    await user.click(screen.getByRole("button", { name: /append entry/i }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).not.toHaveTextContent("Expectation");
    await user.click(screen.getByRole("button", { name: "Create and proceed" }));

    await waitFor(() => expect(franchisePost()).toBeTruthy());
    const body = JSON.parse(franchisePost()[1].body);
    expect(body.franchise_name_en).toBe("Test Anime");
    expect(body).not.toHaveProperty("franchise_expectation");
  });
});
