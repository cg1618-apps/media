// RequestModal: filing from a page, the general form, and editing. The body
// assertions are exact because the server refuses any key it does not expect
// (an edit carrying `kind` is 422) and half a target (422).
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import RequestModal from "./RequestModal";

vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

let answer;

beforeEach(() => {
  answer = () => ({ ok: true, status: 201, json: () => Promise.resolve({ id: "r1" }) });
  vi.stubGlobal(
    "fetch",
    vi.fn((url) =>
      Promise.resolve(
        url === "/api/constants"
          ? { ok: false, json: () => Promise.resolve(null) }
          : answer(),
      ),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderModal(props) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <RequestModal onClose={onClose} {...props} />
    </QueryClientProvider>,
  );
  return onClose;
}

const writes = () =>
  global.fetch.mock.calls.filter(([, opts]) => opts?.method && opts.method !== "GET");

describe("filing from a page", () => {
  const target = { type: "anime", id: "uuid-1", label: "Frieren" };

  it("shows the target, opens on a data error and sends the target and page", async () => {
    const user = userEvent.setup();
    const onClose = renderModal({ target, pagePath: "/anime/12" });

    expect(screen.getByText("Frieren")).toBeInTheDocument();
    expect(screen.getByLabelText("Kind")).toHaveValue("data_error");
    // A page report sends its address without asking for one.
    expect(screen.queryByLabelText("Page address")).toBeNull();

    await user.type(screen.getByLabelText(/description/i), "Wrong episode count");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [[url, opts]] = writes();
    expect(url).toBe("/api/requests");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({
      kind: "data_error",
      description: "Wrong episode count",
      target_type: "anime",
      target_id: "uuid-1",
      page_path: "/anime/12",
    });
  });

  it("shows the server's refusal and stays open", async () => {
    answer = () => ({
      ok: false,
      status: 409,
      json: () =>
        Promise.resolve({ detail: "You already have 15 open requests, your limit." }),
    });
    const user = userEvent.setup();
    const onClose = renderModal({ target, pagePath: "/anime/12" });

    await user.type(screen.getByLabelText(/description/i), "Something");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You already have 15 open requests, your limit.",
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("sends nothing without a description", async () => {
    const user = userEvent.setup();
    renderModal({ target, pagePath: "/anime/12" });
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(writes()).toEqual([]);
  });
});

describe("the general form", () => {
  it("asks for a page address only for a bug report", async () => {
    const user = userEvent.setup();
    const onClose = renderModal({ defaultKind: "new_entry" });

    expect(screen.queryByLabelText("Page address")).toBeNull();
    await user.selectOptions(screen.getByLabelText("Kind"), "bug");
    await user.type(screen.getByLabelText("Page address"), "/statistics");
    await user.type(screen.getByLabelText(/description/i), "Chart is empty");
    await user.type(screen.getByLabelText("Remark"), "Since today");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(JSON.parse(writes()[0][1].body)).toEqual({
      kind: "bug",
      description: "Chart is empty",
      remark: "Since today",
      page_path: "/statistics",
    });
  });
});

describe("editing", () => {
  const request = {
    id: "r9",
    kind: "incomplete_data",
    description: "Missing studio",
    remark: "old remark",
    target: { type: "anime", type_label: "Anime", id: "u", label: "Frieren" },
  };

  it("offers only the description and remark, and clears an emptied remark", async () => {
    answer = () => ({ ok: true, status: 200, json: () => Promise.resolve(request) });
    const user = userEvent.setup();
    const onClose = renderModal({ request });

    // The kind is read-only text, not a control.
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByText("Incomplete data report")).toBeInTheDocument();

    const description = screen.getByLabelText(/description/i);
    await user.clear(description);
    await user.type(description, "Missing studio and director");
    await user.clear(screen.getByLabelText("Remark"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [[url, opts]] = writes();
    expect(url).toBe("/api/requests/r9");
    expect(opts.method).toBe("PATCH");
    expect(JSON.parse(opts.body)).toEqual({
      description: "Missing studio and director",
      remark: null,
    });
  });
});
