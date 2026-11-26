// Frontend: the Add page's marks section - the entry's flags, its 待補充 mark
// and its content labels in one card at the top of the form, above the tab's
// own card and its auto-fill search. The flags are fields of the tab's form
// and travel with its create.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Add from "./Add";
import { endpoints } from "../../api/endpoints";
import * as autofill from "../../lib/autofill";
import * as notesApi from "../notes/api";

vi.mock("../notes/api");
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    has: () => true,
    visibleGatedTypes: [],
    user: { username: "admin" },
    modes: [],
  }),
}));
vi.mock("../../lib/autofill", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, buildAutofillPatch: vi.fn() };
});

const LABELS = [{ system_id: "l1", key: "nsfw", label: "NSFW" }];
const SOURCE = { system_id: "m-src", movie_name_en: "Source Movie" };

function json(body) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
}

function mockFetch() {
  const listUrl = endpoints.resource("movie").list();
  return vi.fn((url, options = {}) => {
    const u = String(url);
    const method = options.method || "GET";
    if (u === endpoints.contentLabels.list()) return json(LABELS);
    if (u === `${listUrl}?limit=2000`) return json([SOURCE]);
    if (u === listUrl && method === "POST")
      return json({ system_id: "m-1", movie_name_en: "New Movie" });
    return json([]);
  });
}

async function mountOn(tab, user) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Add />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());
  if (tab) await user.click(screen.getByRole("button", { name: tab }));
}

beforeEach(() => {
  vi.mocked(notesApi.fetchSections).mockResolvedValue([]);
  vi.mocked(notesApi.fetchNotes).mockResolvedValue([]);
  vi.mocked(autofill.buildAutofillPatch).mockReset();
  vi.stubGlobal("fetch", mockFetch());
  vi.stubGlobal("scrollTo", vi.fn());
  return () => vi.unstubAllGlobals();
});

describe("Add page — the marks section", () => {
  it("opens the form, above the tab's card and its auto-fill search", async () => {
    const user = userEvent.setup();
    await mountOn("Movie", user);

    const marks = screen.getByTestId("form-marks-section");
    expect(marks.closest("form").firstElementChild).toBe(marks);
    const search = screen.getByPlaceholderText(/^Auto-fill from existing entry/);
    expect(marks.contains(search)).toBe(false);
    expect(marks.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Flags, then the 待補充 mark, then the labels - and only in here.
    const boxes = within(marks)
      .getAllByRole("checkbox")
      .map((c) => c.closest("label").textContent);
    expect(boxes.slice(0, 4)).toEqual(["Pin to dashboard", "Plan Next", "Redo", "待補充"]);
    expect(await within(marks).findByText("Content Labels")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox", { name: "Plan Next" })).toHaveLength(1);
  });

  it("sends the flags ticked there with the create", async () => {
    vi.mocked(autofill.buildAutofillPatch).mockReturnValue({ movie_name_en: "New Movie" });
    const user = userEvent.setup();
    await mountOn("Movie", user);
    await user.type(screen.getByPlaceholderText(/^Auto-fill from existing entry/), "Source Movie");
    await user.click(await screen.findByText("Source Movie", { selector: "span" }));

    const marks = screen.getByTestId("form-marks-section");
    await user.click(within(marks).getByRole("checkbox", { name: "Plan Next" }));
    await user.click(within(marks).getByRole("checkbox", { name: "Redo" }));
    await user.click(screen.getByRole("button", { name: /append entry/i }));

    let call;
    await waitFor(() => {
      call = fetch.mock.calls.find(
        ([url, opts]) =>
          String(url) === endpoints.resource("movie").list() && opts?.method === "POST",
      );
      expect(call).toBeTruthy();
    });
    const body = JSON.parse(call[1].body);
    expect(body.watch_next).toBe(true);
    expect(body.to_rewatch).toBe(true);
    expect(body.is_pinged).toBe(false);
  });

  it("holds only the mark and the labels on a grouping tier", async () => {
    const user = userEvent.setup();
    await mountOn(null, user);
    await user.click(screen.getByRole("button", { name: /structure/i }));
    await user.click(screen.getByRole("button", { name: /^Collection$/ }));

    const marks = screen.getByTestId("form-marks-section");
    expect(within(marks).queryByTestId("entry-flags")).toBeNull();
    expect(within(marks).getByRole("checkbox", { name: "待補充" })).toBeInTheDocument();
    expect(await within(marks).findByText("Content Labels")).toBeInTheDocument();
  });
});
