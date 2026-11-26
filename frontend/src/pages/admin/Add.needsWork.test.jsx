// Frontend: marking a record 待補充 Needs Work while adding it.
//
// The record has no id until the create answers, so the Add page holds the
// mark and PUTs it to the new id afterwards. Drawn only for a holder of
// manage.requests: the refusal viewer holds every other key, and the mirror
// case is the same viewer with it added.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Add from "./Add";
import * as notesApi from "../notes/api";

vi.mock("../notes/api");

const showToast = vi.fn();
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast }),
}));

const viewer = { handles: true };
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    has: (permission) => permission !== "manage.requests" || viewer.handles,
    visibleGatedTypes: [],
    user: { username: "admin" },
    modes: [],
  }),
}));

function json(body, ok = true) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? "OK" : "boom",
    json: () => Promise.resolve(body),
  });
}

function mockFetch() {
  return vi.fn((url, options = {}) => {
    const u = String(url);
    const method = options.method || "GET";
    if (u.startsWith("/api/needs-work/") && method === "PUT")
      return json({ flagged: true, note: JSON.parse(options.body).note });
    if (u === "/api/options/Needs%20Work%20Note")
      return json([{ system_id: "o1", category: "Needs Work Note", value: "續集未補" }]);
    if (u === "/api/collection/" && method === "POST")
      return json({ system_id: "c-new", collection_name_en: "Marvel" });
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

async function openCollectionTab(user) {
  await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: /structure/i }));
  await user.click(screen.getByRole("button", { name: /^Collection$/ }));
}

function inputUnder(labelText) {
  return screen.getByText(labelText).parentElement.querySelector("input");
}

const markPuts = () =>
  fetch.mock.calls
    .filter(([url, opts]) => String(url).startsWith("/api/needs-work/") && opts?.method === "PUT")
    .map(([url, opts]) => ({ url: String(url), body: JSON.parse(opts.body) }));

beforeEach(() => {
  showToast.mockReset();
  viewer.handles = true;
  vi.mocked(notesApi.fetchSections).mockResolvedValue([]);
  vi.mocked(notesApi.fetchNotes).mockResolvedValue([]);
  vi.stubGlobal("fetch", mockFetch());
  vi.stubGlobal("scrollTo", vi.fn());
});

describe("Add page — 待補充 Needs Work", () => {
  it("marks the new collection with a common note once it is created", async () => {
    const user = userEvent.setup();
    mount();
    await openCollectionTab(user);
    await user.type(inputUnder("Collection Name EN"), "Marvel");
    await user.click(screen.getByRole("checkbox", { name: "待補充" }));
    // The common note is a one-click pick.
    await user.click(await screen.findByRole("button", { name: "續集未補" }));
    await user.click(screen.getByRole("button", { name: /append entry/i }));

    await waitFor(() => expect(markPuts()).toHaveLength(1));
    expect(markPuts()[0]).toEqual({
      url: "/api/needs-work/collection/c-new",
      body: { note: "續集未補" },
    });
    // The field resets, so the next record does not inherit the mark.
    expect(screen.getByRole("checkbox", { name: "待補充" })).not.toBeChecked();
  });

  it("sends no mark when the box was left unticked", async () => {
    const user = userEvent.setup();
    mount();
    await openCollectionTab(user);
    await user.type(inputUnder("Collection Name EN"), "Marvel");
    await user.click(screen.getByRole("button", { name: /append entry/i }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith("success", "Collection appended successfully."),
    );
    expect(markPuts()).toHaveLength(0);
  });

  it("is not offered without manage.requests, whatever else the viewer holds", async () => {
    viewer.handles = false;
    const user = userEvent.setup();
    mount();
    await openCollectionTab(user);
    expect(inputUnder("Collection Name EN")).toBeInTheDocument();
    expect(screen.queryByTestId("needs-work-add-field")).toBeNull();
  });
});
