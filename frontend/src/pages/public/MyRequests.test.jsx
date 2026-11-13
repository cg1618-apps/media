// My requests: the filer's own list. The response column is behind one
// switch, so its test reads that switch rather than assuming its value - and
// the Edit button follows the server's can_edit, not the status.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MyRequests, { SHOW_RESPONSE_TO_FILER } from "./MyRequests";

vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const request = (overrides) => ({
  id: "r",
  kind: "data_error",
  status: "open",
  description: "desc",
  remark: null,
  page_path: null,
  target: null,
  author_username: "bob",
  response: null,
  handled_by_username: null,
  handled_at: null,
  created_at: "2026-11-13T10:00:00",
  updated_at: "2026-11-13T10:00:00",
  can_edit: true,
  ...overrides,
});

const ROWS = [
  request({
    id: "open-1",
    description: "Wrong year",
    target: {
      type: "anime",
      type_label: "Anime",
      id: "a1",
      label: "Frieren",
      nav_path: "/anime/a1",
      missing: false,
    },
  }),
  request({
    id: "done-1",
    status: "done",
    kind: "new_entry",
    description: "Please add Dandadan",
    response: "Added, thanks",
    can_edit: false,
  }),
  request({
    id: "gone-1",
    status: "declined",
    description: "Bad cover",
    can_edit: false,
    target: {
      type: "manga",
      type_label: "Manga",
      id: "m1",
      label: "Old manga",
      nav_path: null,
      missing: true,
    },
  }),
];

let rows;

beforeEach(() => {
  rows = ROWS;
  vi.stubGlobal(
    "fetch",
    vi.fn((url) =>
      Promise.resolve(
        url.startsWith("/api/requests/mine")
          ? { ok: true, json: () => Promise.resolve(rows) }
          : { ok: false, json: () => Promise.resolve(null) },
      ),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MyRequests />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const rowOf = (text) => screen.getByText(text).closest("tr");

describe("My requests", () => {
  it("reads the caller's own list", async () => {
    renderPage();
    await screen.findByText("Wrong year");
    expect(global.fetch.mock.calls.some(([url]) => url === "/api/requests/mine")).toBe(true);
  });

  it("links a live target and marks a deleted one", async () => {
    renderPage();
    await screen.findByText("Wrong year");
    expect(within(rowOf("Wrong year")).getByRole("link", { name: "Frieren" })).toHaveAttribute(
      "href",
      "/anime/a1",
    );
    const gone = rowOf("Bad cover");
    expect(within(gone).queryByRole("link")).toBeNull();
    expect(within(gone).getByText("Old manga")).toBeInTheDocument();
    expect(within(gone).getByText("(deleted)")).toBeInTheDocument();
  });

  it("offers Edit only where the server says can_edit", async () => {
    renderPage();
    await screen.findByText("Wrong year");
    expect(within(rowOf("Wrong year")).getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(within(rowOf("Please add Dandadan")).queryByRole("button", { name: "Edit" })).toBeNull();
    expect(within(rowOf("Bad cover")).queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("opens the request for editing", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Wrong year");
    await user.click(within(rowOf("Wrong year")).getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Edit request");
    expect(screen.getByLabelText(/description/i)).toHaveValue("Wrong year");
  });

  it("opens the general form from New request", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Wrong year");
    await user.click(screen.getByRole("button", { name: "New request" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("New request");
  });

  it("shows the handler's response as SHOW_RESPONSE_TO_FILER says", async () => {
    renderPage();
    await screen.findByText("Wrong year");
    if (SHOW_RESPONSE_TO_FILER) {
      expect(screen.getByText("Response")).toBeInTheDocument();
      expect(screen.getByText("Added, thanks")).toBeInTheDocument();
    } else {
      expect(screen.queryByText("Added, thanks")).toBeNull();
    }
  });

  it("is switched on, as the owner decided", () => {
    expect(SHOW_RESPONSE_TO_FILER).toBe(true);
  });

  it("says what to do when there are none", async () => {
    rows = [];
    renderPage();
    expect(await screen.findByText(/you have no requests/i)).toBeInTheDocument();
  });
});
