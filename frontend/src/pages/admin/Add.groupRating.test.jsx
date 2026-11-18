// Frontend: the viewer's own rating of a grouping tier on the Add page.
//
// A rating and an expectation of a tier are the viewer's own, kept per
// account and written through PUT /api/me/ratings under self.list; the
// catalogue write carries neither. So the Collection, Franchise and Series
// tabs draw My Rating and Expectation fields only for
// a viewer who keeps a list, the create call never carries them, and the PUT
// goes to the new row once the create has returned its id. The franchise an
// entry's save quick-creates carries no expectation either.
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

// Whether the viewer keeps a list (self.list); everything else is held.
const viewer = { keepsList: true };
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    has: (permission) => permission !== "self.list" || viewer.keepsList,
    visibleGatedTypes: [],
    user: { username: "admin" },
    modes: [],
  }),
}));

const FRANCHISE = { system_id: "f1", franchise_name_en: "Test Franchise" };

function json(body, ok = true) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? "OK" : "boom",
    json: () => Promise.resolve(body),
  });
}

function mockFetch({ ratingOk = true } = {}) {
  return vi.fn((url, options = {}) => {
    const u = String(url);
    const method = options.method || "GET";
    if (u.startsWith("/api/me/ratings/") && method === "PUT") {
      const [, , , ownerType, ownerId] = u.split("/");
      const body = JSON.parse(options.body);
      return json(
        {
          owner_type: ownerType,
          owner_id: ownerId,
          my_rating: body.my_rating ?? null,
          expectation: body.expectation ?? null,
        },
        ratingOk,
      );
    }
    if (u === "/api/collection/" && method === "POST")
      return json({ system_id: "c-new", collection_name_en: "Marvel" });
    if (u === "/api/franchise/" && method === "POST")
      return json({ system_id: "f-new", franchise_name_en: "New Franchise" });
    if (u === "/api/series/" && method === "POST")
      return json({ system_id: "s-new", series_name_en: "Saga" });
    if (u === "/api/anime/" && method === "POST")
      return json({ system_id: "a-new", anime_name_en: "Test Anime" });
    if (u.startsWith("/api/franchise/") && method === "GET") return json([FRANCHISE]);
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

function inputUnder(labelText) {
  return screen.getByText(labelText).parentElement.querySelector("input");
}

async function openTab(user, name) {
  await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: /structure/i }));
  await user.click(screen.getByRole("button", { name: new RegExp(`^${name}$`) }));
}

const createCall = (path) =>
  fetch.mock.calls.find(([url, opts]) => String(url) === path && opts?.method === "POST");

const ratingPuts = () =>
  fetch.mock.calls
    .filter(([url, opts]) => String(url).startsWith("/api/me/ratings/") && opts?.method === "PUT")
    .map(([url, opts]) => ({ url: String(url), body: JSON.parse(opts.body) }));

beforeEach(() => {
  showToast.mockReset();
  viewer.keepsList = true;
  vi.mocked(notesApi.fetchSections).mockResolvedValue([]);
  vi.mocked(notesApi.fetchNotes).mockResolvedValue([]);
  vi.stubGlobal("fetch", mockFetch());
  vi.stubGlobal("scrollTo", vi.fn());
});

describe("Add page — a viewer who keeps a list rates the group it creates", () => {
  it("the Franchise tab PUTs rating and expectation to the new franchise, and the POST carries neither", async () => {
    const user = userEvent.setup();
    mount();
    await openTab(user, "Franchise");
    await user.type(
      await screen.findByPlaceholderText("English franchise name"),
      "New Franchise",
    );
    await user.selectOptions(screen.getByLabelText("My Rating"), "A");
    await user.selectOptions(screen.getByLabelText("Expectation"), "High");
    await user.click(screen.getByRole("button", { name: /append entry/i }));

    await waitFor(() => expect(ratingPuts()).toHaveLength(1));
    expect(ratingPuts()[0]).toEqual({
      url: "/api/me/ratings/franchise/f-new",
      body: { my_rating: "A", expectation: "High" },
    });
    const body = JSON.parse(createCall("/api/franchise/")[1].body);
    expect(body).not.toHaveProperty("my_rating");
    expect(body).not.toHaveProperty("franchise_expectation");
    expect(body).not.toHaveProperty("expectation");
  });

  it("the Collection tab PUTs a rating and an expectation", async () => {
    const user = userEvent.setup();
    mount();
    await openTab(user, "Collection");
    await user.type(inputUnder("Collection Name EN"), "Marvel");
    await user.selectOptions(screen.getByLabelText("My Rating"), "S");
    await user.selectOptions(screen.getByLabelText("Expectation"), "Low");
    await user.click(screen.getByRole("button", { name: /append entry/i }));

    await waitFor(() => expect(ratingPuts()).toHaveLength(1));
    expect(ratingPuts()[0]).toEqual({
      url: "/api/me/ratings/collection/c-new",
      body: { my_rating: "S", expectation: "Low" },
    });
  });

  it("the Series tab PUTs a rating and an expectation", async () => {
    const user = userEvent.setup();
    mount();
    await openTab(user, "Series");
    await user.type(screen.getByPlaceholderText("Search existing franchises..."), "Test");
    await user.click(await screen.findByText("Test Franchise"));
    await user.type(inputUnder("Series Name EN"), "Saga");
    await user.selectOptions(screen.getByLabelText("My Rating"), "B");
    await user.selectOptions(screen.getByLabelText("Expectation"), "Medium");
    await user.click(screen.getByRole("button", { name: /append entry/i }));

    await waitFor(() => expect(ratingPuts()).toHaveLength(1));
    expect(ratingPuts()[0]).toEqual({
      url: "/api/me/ratings/series/s-new",
      body: { my_rating: "B", expectation: "Medium" },
    });
  });

  it("sends no PUT when nothing was chosen", async () => {
    const user = userEvent.setup();
    mount();
    await openTab(user, "Franchise");
    await user.type(
      await screen.findByPlaceholderText("English franchise name"),
      "New Franchise",
    );
    expect(screen.getByLabelText("My Rating")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: /append entry/i }));

    await waitFor(() => expect(createCall("/api/franchise/")).toBeTruthy());
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith("success", "Franchise appended successfully."),
    );
    expect(ratingPuts()).toHaveLength(0);
  });

  it("says the franchise saved but the rating did not when the PUT fails", async () => {
    vi.stubGlobal("fetch", mockFetch({ ratingOk: false }));
    const user = userEvent.setup();
    mount();
    await openTab(user, "Franchise");
    await user.type(
      await screen.findByPlaceholderText("English franchise name"),
      "New Franchise",
    );
    await user.selectOptions(screen.getByLabelText("My Rating"), "A");
    await user.click(screen.getByRole("button", { name: /append entry/i }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        "error",
        "Franchise saved, but your rating did not save.",
      ),
    );
  });
});

describe("Add page — a viewer without a list sees and sends no rating", () => {
  beforeEach(() => {
    viewer.keepsList = false;
  });

  it("the Franchise tab offers neither, and its save sends neither", async () => {
    const user = userEvent.setup();
    mount();
    await openTab(user, "Franchise");
    await user.type(
      await screen.findByPlaceholderText("English franchise name"),
      "New Franchise",
    );
    expect(screen.queryByLabelText("My Rating")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Expectation")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /append entry/i }));
    await waitFor(() => expect(createCall("/api/franchise/")).toBeTruthy());
    const body = JSON.parse(createCall("/api/franchise/")[1].body);
    expect(body.franchise_name_en).toBe("New Franchise");
    expect(body).not.toHaveProperty("my_rating");
    expect(body).not.toHaveProperty("franchise_expectation");
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith("success", "Franchise appended successfully."),
    );
    expect(ratingPuts()).toHaveLength(0);
  });

  it.each(["Collection", "Series"])("the %s tab offers no rating", async (name) => {
    const user = userEvent.setup();
    mount();
    await openTab(user, name);
    expect(await screen.findByText(`${name} Name EN`)).toBeInTheDocument();
    expect(screen.queryByLabelText("My Rating")).not.toBeInTheDocument();
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

    await waitFor(() => expect(createCall("/api/franchise/")).toBeTruthy());
    const body = JSON.parse(createCall("/api/franchise/")[1].body);
    expect(body.franchise_name_en).toBe("Test Anime");
    expect(body).not.toHaveProperty("franchise_expectation");
  });
});
