// Frontend: the Add page labels a collection and a series the way it labels a
// franchise - the picker is drawn on the tab, says what the tier's label
// hides, and the selection is PUT to the tier's own endpoint once the create
// call has returned the new id.
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

const FRANCHISE = { system_id: "f1", franchise_name_en: "Test Franchise" };

const VOCABULARY = [
  { system_id: "1", key: "nsfw", label: "NSFW", description: "" },
  { system_id: "2", key: "erotica", label: "擦邊肉番", description: "" },
];

function json(body, ok = true) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? "OK" : "boom",
    json: () => Promise.resolve(body),
  });
}

// `labelsOk` false makes the label PUT fail, to prove the failure is said.
function mockFetch({ createPath, created, labelsOk = true }) {
  return vi.fn((url, options = {}) => {
    const u = String(url);
    const method = options.method || "GET";
    if (u === "/api/content-labels/" && method === "GET") return json(VOCABULARY);
    if (u.startsWith("/api/content-labels/") && method === "PUT")
      return json(labelsOk ? JSON.parse(options.body).label_keys : {}, labelsOk);
    if (u.startsWith("/api/franchise/") && method === "GET")
      return json([FRANCHISE]);
    if (u === createPath && method === "POST") return json(created);
    return json([]);
  });
}

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Add />
    </QueryClientProvider>,
  );
}

function inputUnder(labelText) {
  return screen.getByText(labelText).parentElement.querySelector("input");
}

function labelPut(fetchMock) {
  const call = fetchMock.mock.calls.find(
    ([url, opts]) =>
      String(url).startsWith("/api/content-labels/") && opts?.method === "PUT",
  );
  return call && { url: call[0], body: JSON.parse(call[1].body) };
}

async function openTab(user, name) {
  await waitFor(() =>
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: /structure/i }));
  await user.click(
    screen.getByRole("button", { name: new RegExp(`^${name}$`) }),
  );
}

beforeEach(() => {
  showToast.mockReset();
  vi.mocked(notesApi.fetchSections).mockResolvedValue([]);
  vi.mocked(notesApi.fetchNotes).mockResolvedValue([]);
});

describe("Add page - collection labels", () => {
  it("PUTs the chosen labels to the new collection", async () => {
    const fetchMock = mockFetch({
      createPath: "/api/collection/",
      created: { system_id: "c-new", collection_name_en: "Marvel" },
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    mount();
    await openTab(user, "Collection");

    expect(
      await screen.findByText(/a labelled collection is hidden/i),
    ).toHaveTextContent("every franchise, series and entry in it");
    await user.type(inputUnder("Collection Name EN"), "Marvel");
    await user.click(screen.getByLabelText("擦邊肉番"));
    await user.click(screen.getByRole("button", { name: /append entry/i }));

    await waitFor(() => expect(labelPut(fetchMock)).toBeTruthy());
    expect(labelPut(fetchMock)).toEqual({
      url: "/api/content-labels/collection/c-new",
      body: { label_keys: ["erotica", "nsfw"] },
    });
    vi.unstubAllGlobals();
  });

  it("has no required label: nothing is ticked or locked", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ createPath: "/api/collection/", created: {} }),
    );
    const user = userEvent.setup();
    mount();
    await openTab(user, "Collection");

    const nsfw = await screen.findByLabelText("NSFW");
    expect(nsfw).not.toBeChecked();
    expect(nsfw).not.toBeDisabled();
    vi.unstubAllGlobals();
  });

  it("says so when the collection saved but its labels did not", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        createPath: "/api/collection/",
        created: { system_id: "c-new", collection_name_en: "Marvel" },
        labelsOk: false,
      }),
    );
    const user = userEvent.setup();
    mount();
    await openTab(user, "Collection");
    await user.type(inputUnder("Collection Name EN"), "Marvel");
    await user.click(await screen.findByLabelText("擦邊肉番"));
    await user.click(screen.getByRole("button", { name: /append entry/i }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        "error",
        "Collection saved, but its content labels failed to save.",
      ),
    );
    vi.unstubAllGlobals();
  });
});

describe("Add page - series labels", () => {
  it("PUTs the chosen labels to the new series", async () => {
    const fetchMock = mockFetch({
      createPath: "/api/series/",
      created: { system_id: "s-new", series_name_en: "Saga" },
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    mount();
    await openTab(user, "Series");

    expect(
      await screen.findByText(/a labelled series is hidden/i),
    ).toHaveTextContent("every entry in it");
    await user.type(
      screen.getByPlaceholderText("Search existing franchises..."),
      "Test",
    );
    await user.click(await screen.findByText("Test Franchise"));
    await user.type(inputUnder("Series Name EN"), "Saga");
    await user.click(screen.getByLabelText("擦邊肉番"));
    await user.click(screen.getByRole("button", { name: /append entry/i }));

    await waitFor(() => expect(labelPut(fetchMock)).toBeTruthy());
    expect(labelPut(fetchMock)).toEqual({
      url: "/api/content-labels/series/s-new",
      body: { label_keys: ["erotica", "nsfw"] },
    });
    vi.unstubAllGlobals();
  });
});
