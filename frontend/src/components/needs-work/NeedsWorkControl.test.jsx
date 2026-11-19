// The editor's 待補充 control: hidden without manage.requests (the refusal
// viewer holds every other key, so its absence is that key's doing), and for
// a holder it marks, saves a note and clears through the endpoint the server
// gates on.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import NeedsWorkControl from "./NeedsWorkControl";
import { noteSuggestions } from "./NeedsWorkNoteInput";

const auth = { handles: true };
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    has: (p) => (p === "manage.requests" ? auth.handles : true),
  }),
}));
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const MARK_URL = "/api/needs-work/franchise/f-uuid";
let stored;

beforeEach(() => {
  auth.handles = true;
  stored = { owner_type: "franchise", owner_id: "f-uuid", flagged: false, note: null };
  vi.stubGlobal(
    "fetch",
    vi.fn((url, opts) => {
      if (opts?.method === "PUT") {
        stored = { ...stored, flagged: true, note: JSON.parse(opts.body).note };
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(stored) });
      }
      if (opts?.method === "DELETE") {
        stored = { ...stored, flagged: false, note: null };
        return Promise.resolve({ ok: true, status: 204 });
      }
      if (url === "/api/options/Needs%20Work%20Note") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([{ system_id: "o1", value: "官方名稱未出" }]),
        });
      }
      const body = url.endsWith("/notes") ? [{ note: "續集未補", count: 3 }] : stored;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderControl() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NeedsWorkControl ownerType="franchise" ownerId="f-uuid" />
    </QueryClientProvider>,
  );
}

const writes = () =>
  global.fetch.mock.calls.filter(([, opts]) => opts?.method && opts.method !== "GET");

describe("NeedsWorkControl", () => {
  it("is hidden from a viewer without manage.requests, whatever else they hold", () => {
    auth.handles = false;
    renderControl();
    expect(screen.queryByTestId("needs-work-control")).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("marks, saves a suggested note, and clears", async () => {
    const user = userEvent.setup();
    renderControl();
    const box = await screen.findByRole("checkbox", { name: /Needs Work/ });
    await waitFor(() => expect(box).toBeEnabled());
    expect(box).not.toBeChecked();

    await user.click(box);
    await waitFor(() => expect(box).toBeChecked());
    expect(writes()[0][0]).toBe(MARK_URL);
    expect(writes()[0][1].method).toBe("PUT");
    expect(JSON.parse(writes()[0][1].body)).toEqual({ note: null });

    // The notes in use are offered, so a mark joins an existing group.
    const field = await screen.findByLabelText("Needs Work note");
    await user.click(field);
    await user.click(await screen.findByText("續集未補"));
    await user.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(JSON.parse(writes()[1][1].body)).toEqual({ note: "續集未補" });

    await user.click(box);
    await waitFor(() => expect(box).not.toBeChecked());
    expect(writes()[2][1].method).toBe("DELETE");
    expect(writes()[2][0]).toBe(MARK_URL);
  });

  it("offers the common notes as one-click picks, and first among the suggestions", async () => {
    const user = userEvent.setup();
    renderControl();
    const box = await screen.findByRole("checkbox", { name: /Needs Work/ });
    await waitFor(() => expect(box).toBeEnabled());
    await user.click(box);

    const picks = await screen.findByRole("group", { name: "Common notes" });
    await user.click(within(picks).getByRole("button", { name: "官方名稱未出" }));
    expect(screen.getByLabelText("Needs Work note")).toHaveValue("官方名稱未出");
    await user.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(JSON.parse(writes()[1][1].body)).toEqual({ note: "官方名稱未出" });
  });
});

describe("noteSuggestions", () => {
  it("puts the common notes first, then the notes in use, once each", () => {
    expect(
      noteSuggestions(["官方名稱未出", "續集未補"], [
        { note: "續集未補", count: 3 },
        { note: "名稱缺", count: 1 },
      ]),
    ).toEqual(["官方名稱未出", "續集未補", "名稱缺"]);
    expect(noteSuggestions(undefined, undefined)).toEqual([]);
  });
});
