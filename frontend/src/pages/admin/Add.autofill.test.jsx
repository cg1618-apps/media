// Frontend: the "Auto-fill from existing entry" box at the top of the eight
// non-gated Add tabs that predate EntryAutofillSearch (anime, anime movie,
// movie, TV show, cartoon, manga, novel, comic). Pins, per tab, what the box
// searches (every name column the tab has always searched), the badge beside
// a result, the title it shows, and what a pick does: Add.jsx's
// applyEntryAutofill builds the patch from the picked entry, the type and
// that type's auto-fill field list, merges it into THAT tab's form, toasts,
// and the box clears its query. Game and the gated tabs have their own tests.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Add from "./Add";
import { endpoints } from "../../api/endpoints";
import { BUILTIN_AUTOFILL } from "../../config/formFields";
import * as autofill from "../../lib/autofill";
import * as notesApi from "../notes/api";

vi.mock("../notes/api");

const showToast = vi.fn();
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast }),
}));

// The real patch, plus one sentinel name, so the test can see the patch land
// in the tab's own form without depending on which fields the built-in list
// happens to copy.
vi.mock("../../lib/autofill", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, buildAutofillPatch: vi.fn(actual.buildAutofillPatch) };
});

const FRANCHISE = { system_id: "f1", franchise_name_en: "Test Franchise" };

// tab label, list type, the name columns the box searches, the
// badge column (null = no badge), the title it shows, the sentinel column.
const CASES = [
  {
    label: "Anime",
    type: "anime",
    names: ["en", "cn", "roman", "jp", "alt"].map((s) => `anime_name_${s}`),
    badge: "airing_type",
    title: ["anime_name_cn", "anime_name_en"],
    sentinel: "anime_name_en",
  },
  {
    label: "Anime Movie",
    type: "anime-movie",
    names: ["en", "cn", "roman", "jp", "alt"].map(
      (s) => `anime_movie_name_${s}`,
    ),
    badge: null,
    title: ["anime_movie_name_cn", "anime_movie_name_en"],
    sentinel: "anime_movie_name_en",
  },
  {
    label: "Movie",
    type: "movie",
    names: ["en", "cn", "alt"].map((s) => `movie_name_${s}`),
    badge: "movie_type",
    title: ["movie_name_cn", "movie_name_en"],
    sentinel: "movie_name_en",
  },
  {
    label: "TV Show",
    type: "tv-show",
    names: ["en", "cn", "alt"].map((s) => `tv_name_${s}`),
    badge: "region",
    title: ["tv_name_cn", "tv_name_en"],
    sentinel: "tv_name_en",
  },
  {
    label: "Cartoon",
    type: "cartoon",
    names: ["en", "cn", "alt"].map((s) => `cartoon_name_${s}`),
    badge: "airing_type",
    title: ["cartoon_name_cn", "cartoon_name_en"],
    sentinel: "cartoon_name_en",
  },
  {
    label: "Manga",
    type: "manga",
    names: ["cn", "en", "roman", "jp", "alt"].map((s) => `manga_name_${s}`),
    badge: "region",
    title: ["manga_name_cn", "manga_name_en"],
    sentinel: "manga_name_en",
  },
  {
    label: "Novel",
    type: "novel",
    names: ["cn", "en", "roman", "jp", "alt"].map((s) => `novel_name_${s}`),
    badge: "region",
    title: ["novel_name_cn", "novel_name_en"],
    sentinel: "novel_name_en",
  },
  {
    label: "Comic",
    type: "comic",
    names: ["en", "cn", "alt"].map((s) => `comic_name_${s}`),
    badge: "comic_type",
    title: ["comic_name_en", "comic_name_cn"],
    sentinel: "comic_name_en",
  },
];

// One entry per case, every searched name distinct so each can be searched
// on its own, and a badge value nothing else on the page would show.
function entryFor(c) {
  const entry = { system_id: `${c.type}-src`, franchise_id: "f1" };
  for (const key of c.names) entry[key] = `Src ${key}`;
  if (c.badge) entry[c.badge] = `BADGE-${c.type}`;
  return entry;
}

function json(body) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  });
}

function mockFetch(c, entry) {
  return vi.fn((url) => {
    const u = String(url);
    if (u.startsWith("/api/franchise/")) return json([FRANCHISE]);
    if (u === `${endpoints.resource(c.type).list()}?limit=2000`) return json([entry]);
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

async function openTab(user, c) {
  await waitFor(() =>
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument(),
  );
  if (c.type !== "anime") {
    await user.click(screen.getByRole("button", { name: c.label }));
  }
  return screen.getByPlaceholderText(/^Auto-fill from existing entry/);
}

// The option a search shows for the entry: its title text, inside a picker
// row. Waits for the list to load first.
async function findResult(c, entry) {
  const title = entry[c.title[0]] || entry[c.title[1]];
  return screen.findByText(title, { selector: "span, div" });
}

beforeEach(() => {
  showToast.mockReset();
  vi.mocked(autofill.buildAutofillPatch).mockClear();
  vi.mocked(notesApi.fetchSections).mockResolvedValue([]);
  vi.mocked(notesApi.fetchNotes).mockResolvedValue([]);
});

describe.each(CASES)("Add page — $label auto-fill box", (c) => {
  it("finds the entry by every name column it searches", async () => {
    const entry = entryFor(c);
    vi.stubGlobal("fetch", mockFetch(c, entry));
    const user = userEvent.setup();
    mount();
    const box = await openTab(user, c);

    for (const key of c.names) {
      await user.clear(box);
      await user.type(box, entry[key]);
      expect(await findResult(c, entry)).toBeInTheDocument();
    }
    await user.clear(box);
    await user.type(box, "nothing matches this");
    const title = entry[c.title[0]];
    expect(
      screen.queryByText(title, { selector: "span, div" }),
    ).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("shows the entry's title, badge and franchise", async () => {
    const entry = entryFor(c);
    vi.stubGlobal("fetch", mockFetch(c, entry));
    const user = userEvent.setup();
    mount();
    const box = await openTab(user, c);

    await user.type(box, entry[c.names[0]]);
    const result = await findResult(c, entry);
    const row = result.closest("li, [role='option'], button") ?? result.parentElement.parentElement;
    expect(within(row).getByText("Test Franchise")).toBeInTheDocument();
    if (c.badge) {
      expect(within(row).getByText(`BADGE-${c.type}`)).toBeInTheDocument();
    } else {
      expect(within(row).queryByText(/^BADGE-/)).not.toBeInTheDocument();
    }
    vi.unstubAllGlobals();
  });

  it("a pick merges the type's auto-fill patch into its form and clears the box", async () => {
    const entry = entryFor(c);
    vi.stubGlobal("fetch", mockFetch(c, entry));
    const actual = await vi.importActual("../../lib/autofill");
    vi.mocked(autofill.buildAutofillPatch).mockImplementation((...args) => ({
      ...actual.buildAutofillPatch(...args),
      [c.sentinel]: `AUTOFILLED-${c.type}`,
    }));
    const user = userEvent.setup();
    mount();
    const box = await openTab(user, c);

    await user.type(box, entry[c.names[0]]);
    await user.click(await findResult(c, entry));

    expect(autofill.buildAutofillPatch).toHaveBeenCalledTimes(1);
    const [source, type, fields, ctx] = vi.mocked(autofill.buildAutofillPatch)
      .mock.calls[0];
    expect(source).toEqual(entry);
    expect(type).toBe(c.type);
    expect(fields).toEqual(BUILTIN_AUTOFILL[c.type]);
    expect(ctx.allFranchises).toEqual([FRANCHISE]);
    expect(ctx.defaults).toBeTypeOf("object");

    expect(
      await screen.findByDisplayValue(`AUTOFILLED-${c.type}`),
    ).toBeInTheDocument();
    // The rest of the real patch landed too: the built-in list copies names.
    const cnKey = c.names.find((k) => k.endsWith("_cn"));
    expect(screen.getByDisplayValue(entry[cnKey])).toBeInTheDocument();
    expect(showToast).toHaveBeenCalledWith(
      "success",
      "Auto-filled fields from existing entry.",
    );
    expect(box).toHaveValue("");

    vi.mocked(autofill.buildAutofillPatch).mockImplementation(
      actual.buildAutofillPatch,
    );
    vi.unstubAllGlobals();
  });
});
