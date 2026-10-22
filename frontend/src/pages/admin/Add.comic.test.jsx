// Frontend: the Add page's comic save sends the Comic Vine ID typed in the
// form even when no Comic Vine link is set - the id travels as typed, never
// derived from the link, as Modify's save sends it (Modify.save.test.jsx).
// The name and franchise come in through the auto-fill box with a stubbed
// patch; the id is typed into the form's own Comic Vine ID field.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Add from "./Add";
import { endpoints } from "../../api/endpoints";
import * as autofill from "../../lib/autofill";
import * as notesApi from "../notes/api";

vi.mock("../notes/api");

const showToast = vi.fn();
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast }),
}));

vi.mock("../../lib/autofill", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, buildAutofillPatch: vi.fn() };
});

const FRANCHISE = {
  system_id: "f1",
  franchise_name_en: "Test Franchise",
  franchise_type: "Comic",
};
const SOURCE = { system_id: "c-src", comic_name_en: "Source Comic" };

function json(body) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  });
}

function mockFetch() {
  const listUrl = endpoints.resource("comic").list();
  return vi.fn((url, options = {}) => {
    const u = String(url);
    const method = options.method || "GET";
    if (u.startsWith("/api/franchise/") && method === "GET")
      return json([FRANCHISE]);
    if (u === `${listUrl}?limit=2000`) return json([SOURCE]);
    if (u === listUrl && method === "POST")
      return json({ system_id: "c-1", comic_name_en: "New Comic" });
    return json([]);
  });
}

beforeEach(() => {
  showToast.mockReset();
  vi.mocked(autofill.buildAutofillPatch).mockReset();
  vi.mocked(notesApi.fetchSections).mockResolvedValue([]);
  vi.mocked(notesApi.fetchNotes).mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Add page — comic save", () => {
  it("sends a typed Comic Vine ID with no Comic Vine link", async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(autofill.buildAutofillPatch).mockReturnValue({
      comic_name_en: "New Comic",
      franchise_id: "f1",
      franchise_text: "Test Franchise",
      comicvine_link: "",
    });

    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <Add />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Comic" }));
    await user.type(
      screen.getByPlaceholderText(/^Auto-fill from existing entry/),
      "Source Comic",
    );
    await user.click(
      await screen.findByText("Source Comic", { selector: "span" }),
    );

    fireEvent.change(screen.getByLabelText("Comic Vine ID"), {
      target: { value: "2127" },
    });
    expect(screen.getByLabelText("Comic Vine Link")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: /append entry/i }));

    let call;
    await waitFor(() => {
      call = fetchMock.mock.calls.find(
        ([url, opts]) =>
          String(url) === endpoints.resource("comic").list() &&
          opts?.method === "POST",
      );
      expect(call).toBeTruthy();
    });
    const body = JSON.parse(call[1].body);
    expect(body.comicvine_id).toBe(2127);
    expect(body.comicvine_link).toBeNull();
  });
});
