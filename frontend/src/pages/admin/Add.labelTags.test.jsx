// Frontend: on Add, the 標籤 Label field and the content-label picker move
// together (hooks/useLabelTagSync.js): ticking a label adds its tag, adding a
// tag ticks its label, the nsfw rule runs through both, and NSFW cannot be
// taken off while another label holds it. Groups have no Label field and are
// left alone.
import { render, screen, waitFor, within } from "@testing-library/react";
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

const VOCABULARY = [
  { system_id: "1", key: "nsfw", label: "NSFW", description: "" },
  { system_id: "2", key: "ecchi", label: "輕微色情", description: "" },
  { system_id: "3", key: "erotica", label: "擦邊肉番", description: "" },
];

function json(body) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  });
}

function mockFetch() {
  return vi.fn((url, options = {}) => {
    const method = options.method || "GET";
    if (String(url) === "/api/content-labels/" && method === "GET")
      return json(VOCABULARY);
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

// The Label field's box: its chips, and the combobox a tag is typed into.
function labelField() {
  return screen.getByText("標籤 Label").parentElement;
}

function labelTags() {
  return within(labelField())
    .queryAllByText(/./, { selector: "span" })
    .map((chip) => chip.textContent.trim());
}

// The picker's checkbox, not the Label field's chip of the same name.
function checkbox(name) {
  return screen.getByRole("checkbox", { name });
}

async function openAnime() {
  mount();
  await waitFor(() =>
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument(),
  );
  await screen.findByRole("checkbox", { name: "輕微色情" });
}

beforeEach(() => {
  showToast.mockReset();
  vi.mocked(notesApi.fetchSections).mockResolvedValue([]);
  vi.mocked(notesApi.fetchNotes).mockResolvedValue([]);
  vi.stubGlobal("fetch", mockFetch());
});

describe("Add page - Label tags follow the content labels", () => {
  it("ticking a label adds its tag, and NSFW's with it", async () => {
    const user = userEvent.setup();
    await openAnime();

    await user.click(checkbox("輕微色情"));

    expect(checkbox("NSFW")).toBeChecked();
    expect(labelTags()).toEqual(["NSFW", "輕微色情"]);

    await user.click(checkbox("輕微色情"));
    expect(labelTags()).toEqual(["NSFW"]);
    expect(checkbox("輕微色情")).not.toBeChecked();
  });

  it("adding a tag ticks its label, and nsfw with its tag", async () => {
    const user = userEvent.setup();
    await openAnime();

    await user.type(
      within(labelField()).getByRole("combobox"),
      "擦邊肉番{Enter}",
    );

    expect(checkbox("擦邊肉番")).toBeChecked();
    expect(checkbox("NSFW")).toBeChecked();
    expect(labelTags()).toEqual(["擦邊肉番", "NSFW"]);
  });

  it("leaves the Label field's other tags where they are", async () => {
    const user = userEvent.setup();
    await openAnime();
    const box = within(labelField()).getByRole("combobox");

    await user.type(box, "校園{Enter}");
    await user.click(checkbox("NSFW"));
    await user.type(box, "戀愛{Enter}");
    await user.click(checkbox("NSFW"));

    expect(labelTags()).toEqual(["校園", "戀愛"]);
    expect(checkbox("NSFW")).not.toBeChecked();
  });

  it("will not take the NSFW tag off while 輕微色情 holds it", async () => {
    const user = userEvent.setup();
    await openAnime();
    await user.click(checkbox("輕微色情"));

    const nsfwChip = within(labelField()).getByText("NSFW", {
      selector: "span",
    });
    await user.click(within(nsfwChip).getByRole("button"));

    expect(labelTags()).toEqual(["NSFW", "輕微色情"]);
    expect(checkbox("NSFW")).toBeChecked();
    expect(showToast).toHaveBeenCalledWith(
      "warning",
      '"NSFW" is carried with 輕微色情 - remove that first.',
    );
  });

  it("brings the labels to the open tab's tags on a tab switch", async () => {
    const user = userEvent.setup();
    await openAnime();
    await user.click(checkbox("擦邊肉番"));

    await user.click(screen.getByRole("button", { name: "Movie" }));
    await waitFor(() => expect(checkbox("擦邊肉番")).not.toBeChecked());
    expect(labelTags()).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Anime" }));
    await waitFor(() => expect(checkbox("擦邊肉番")).toBeChecked());
    expect(labelTags()).toEqual(["NSFW", "擦邊肉番"]);
  });
});
