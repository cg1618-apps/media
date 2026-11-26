// Frontend: Modify's editor carries the 待補充 Needs Work control.
//
// The mark is its own row (PUT /api/needs-work/...), so ticking it saves at
// once and sends no PATCH of the entry; the editor's Save is not involved.
// It is drawn only for a manage.requests holder: the refusal viewer holds
// every other key, so the control's absence is that key's doing.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Modify from "./Modify";
import * as notesApi from "../notes/api";

vi.mock("../notes/api");
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const viewer = { handles: true };
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    has: (permission) => permission !== "manage.requests" || viewer.handles,
    visibleGatedTypes: [],
    user: { username: "cg1618" },
    modes: [],
  }),
}));

const ok = (body) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

const FRANCHISE = { system_id: "c1", franchise_name_en: "Avengers", franchise_type: "Anime" };
const MARK_URL = "/api/needs-work/franchise/c1";

function mockFetch() {
  let flagged = false;
  return vi.fn((url, options = {}) => {
    const u = String(url);
    const method = options.method || "GET";
    if (u === MARK_URL && method === "PUT") {
      flagged = true;
      return ok({ owner_type: "franchise", owner_id: "c1", flagged, note: null });
    }
    if (u === MARK_URL) return ok({ owner_type: "franchise", owner_id: "c1", flagged, note: null });
    if (method === "GET" && u.startsWith("/api/franchise/?")) return ok([FRANCHISE]);
    return ok([]);
  });
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/modify?type=franchise&id=c1"]}>
        <Modify />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  viewer.handles = true;
  vi.mocked(notesApi.fetchSections).mockResolvedValue([]);
  vi.mocked(notesApi.fetchNotes).mockResolvedValue([]);
  vi.stubGlobal("scrollTo", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Modify - the Needs Work mark", () => {
  it("is not drawn for a viewer without manage.requests", async () => {
    viewer.handles = false;
    vi.stubGlobal("fetch", mockFetch());
    mount();

    expect(await screen.findByDisplayValue("Avengers")).toBeInTheDocument();
    expect(screen.queryByTestId("needs-work-control")).toBeNull();
  });

  it("sits in the marks section above the editor card, with no flags on a tier", async () => {
    vi.stubGlobal("fetch", mockFetch());
    mount();

    const control = await screen.findByTestId("needs-work-control");
    const marks = screen.getByTestId("form-marks-section");
    expect(marks.contains(control)).toBe(true);
    expect(within(marks).queryByTestId("entry-flags")).toBeNull();
    // Just the mark's name beside the box - no explanation.
    expect(control.querySelector("label").textContent).toBe("待補充");
    const heading = screen.getByRole("heading", { name: "Avengers" });
    expect(marks.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("marks the owner on its own, with no PATCH of the entry", async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    mount();

    const box = await screen.findByRole("checkbox", { name: "待補充" });
    await waitFor(() => expect(box).toBeEnabled());
    await user.click(box);

    await waitFor(() => expect(box).toBeChecked());
    const methods = fetchMock.mock.calls.map(([url, opts]) => `${opts?.method || "GET"} ${url}`);
    expect(methods).toContain(`PUT ${MARK_URL}`);
    expect(methods.some((m) => m.startsWith("PATCH"))).toBe(false);
  });
});
