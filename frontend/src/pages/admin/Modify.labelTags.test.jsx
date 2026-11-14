// Frontend: on Modify, the 標籤 Label field and the content-label picker move
// together (hooks/useLabelTagSync.js), and after a save the form shows what
// the server stored: the labels the label PUT answered with, and the tags
// read again after that write, which rewrites them.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Modify from "./Modify";
import * as notesApi from "../notes/api";

vi.mock("../notes/api");

const showToast = vi.fn();
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast }),
}));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    has: () => true,
    visibleGatedTypes: [],
    user: { username: "admin" },
    modes: [],
  }),
}));

const VOCABULARY = [
  { system_id: "1", key: "nsfw", label: "NSFW", description: "" },
  { system_id: "2", key: "ecchi", label: "輕微色情", description: "" },
  { system_id: "3", key: "erotica", label: "擦邊肉番", description: "" },
];

const ENTRY = { system_id: "a1", anime_name_en: "A" };
const LABEL_PATH = "/api/content-labels/entry/anime/a1";
const CREDITS_PATH = "/api/credits/anime/a1";

const ok = (body) =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  });

// The entry opens holding 校園, NSFW and 輕微色情 with ecchi and nsfw.
// `storedTags` is what the credits GET answers once a save has run.
function mockFetch({ storedTags } = {}) {
  let saved = false;
  return vi.fn((url, options = {}) => {
    const u = String(url);
    const method = options.method || "GET";
    if (u === "/api/content-labels/" && method === "GET") return ok(VOCABULARY);
    if (u === LABEL_PATH && method === "GET") return ok(["ecchi", "nsfw"]);
    if (u === LABEL_PATH && method === "PUT") {
      saved = true;
      return ok(JSON.parse(options.body).label_keys);
    }
    if (u === CREDITS_PATH && method === "GET")
      return ok({
        credits: {},
        tags: {
          label: saved && storedTags ? storedTags : ["校園", "NSFW", "輕微色情"],
        },
      });
    if (method === "GET" && u.startsWith("/api/anime/?")) return ok([ENTRY]);
    if ((method === "PATCH" || method === "PUT") && u === "/api/anime/a1")
      return ok(ENTRY);
    return ok([]);
  });
}

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/modify?type=anime&id=a1"]}>
        <Modify />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function labelField() {
  return screen.getByText("標籤 Label").parentElement;
}

function labelTags() {
  return within(labelField())
    .queryAllByText(/./, { selector: "span" })
    .map((chip) => chip.textContent.trim());
}

function checkbox(name) {
  return screen.getByRole("checkbox", { name });
}

// Both halves loaded: the picker's labels and the form's tags.
async function openEntry() {
  mount();
  await screen.findByRole("checkbox", { name: "輕微色情" });
  await waitFor(() => expect(checkbox("輕微色情")).toBeChecked());
  await waitFor(() => expect(labelTags()).toEqual(["校園", "NSFW", "輕微色情"]));
}

beforeEach(() => {
  showToast.mockReset();
  vi.mocked(notesApi.fetchSections).mockResolvedValue([]);
  vi.mocked(notesApi.fetchNotes).mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Modify page - Label tags follow the content labels", () => {
  it("unticking a label removes its tag, keeping the rest in place", async () => {
    vi.stubGlobal("fetch", mockFetch());
    const user = userEvent.setup();
    await openEntry();

    await user.click(checkbox("輕微色情"));

    expect(labelTags()).toEqual(["校園", "NSFW"]);
    expect(checkbox("NSFW")).toBeChecked();
  });

  it("adding a tag ticks its label", async () => {
    vi.stubGlobal("fetch", mockFetch());
    const user = userEvent.setup();
    await openEntry();

    await user.type(
      within(labelField()).getByRole("combobox"),
      "擦邊肉番{Enter}",
    );

    expect(checkbox("擦邊肉番")).toBeChecked();
    expect(labelTags()).toEqual(["校園", "NSFW", "輕微色情", "擦邊肉番"]);
  });

  it("saves both halves in step and reads the tags again afterwards", async () => {
    // What the server answers after the save differs from what was sent, so
    // the last assertion can only pass on a read made after the label write.
    const fetchMock = mockFetch({ storedTags: ["校園", "戀愛"] });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const user = userEvent.setup();
    await openEntry();

    // Removing 輕微色情 then NSFW from the tag field unticks both labels.
    await user.click(
      within(within(labelField()).getByText("輕微色情", { selector: "span" }))
        .getByRole("button"),
    );
    await user.click(
      within(within(labelField()).getByText("NSFW", { selector: "span" }))
        .getByRole("button"),
    );
    expect(checkbox("NSFW")).not.toBeChecked();
    expect(checkbox("輕微色情")).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    const calls = () => fetchMock.mock.calls.map(([u, o]) => [String(u), o?.method || "GET", o]);
    await waitFor(() =>
      expect(calls().some(([u, m]) => u === LABEL_PATH && m === "PUT")).toBe(true),
    );
    const creditsPut = calls().find(([u, m]) => u === CREDITS_PATH && m === "PUT");
    expect(JSON.parse(creditsPut[2].body).tags.label).toEqual(["校園"]);
    const labelPut = calls().find(([u, m]) => u === LABEL_PATH && m === "PUT");
    expect(JSON.parse(labelPut[2].body)).toEqual({ label_keys: [] });

    // A credits read after the label write, which is what the form shows.
    const labelPutAt = calls().findIndex(([u, m]) => u === LABEL_PATH && m === "PUT");
    await waitFor(() =>
      expect(
        calls().some(
          ([u, m], i) => i > labelPutAt && u === CREDITS_PATH && m === "GET",
        ),
      ).toBe(true),
    );
    await waitFor(() => expect(labelTags()).toEqual(["校園", "戀愛"]));
  });

  it("will not take the NSFW tag off while 輕微色情 holds it", async () => {
    vi.stubGlobal("fetch", mockFetch());
    const user = userEvent.setup();
    await openEntry();

    await user.click(
      within(within(labelField()).getByText("NSFW", { selector: "span" }))
        .getByRole("button"),
    );

    expect(labelTags()).toEqual(["校園", "NSFW", "輕微色情"]);
    expect(showToast).toHaveBeenCalledWith(
      "warning",
      '"NSFW" is carried with 輕微色情 - remove that first.',
    );
  });
});
