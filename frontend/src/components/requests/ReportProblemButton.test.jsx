// "Report a problem" is drawn for self.requests holders only. The refusal
// case holds every OTHER permission (has() answers true for everything but
// self.requests), so the button's absence proves it asked for that key - an
// empty grant set would hide it for any reason at all. The mirror case uses
// the same viewer with self.requests added.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ReportProblemButton from "./ReportProblemButton";

const auth = { filesRequests: false };
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    has: (p) => (p === "self.requests" ? auth.filesRequests : true),
  }),
}));
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

beforeEach(() => {
  auth.filesRequests = false;
  vi.stubGlobal(
    "fetch",
    vi.fn((url) =>
      Promise.resolve(
        url === "/api/constants"
          ? { ok: false, json: () => Promise.resolve(null) }
          : { ok: true, status: 201, json: () => Promise.resolve({ id: "r1" }) },
      ),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderButton() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/franchise/7/frieren"]}>
        <ReportProblemButton
          targetType="franchise"
          targetId="f-uuid"
          targetLabel="Frieren"
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ReportProblemButton", () => {
  it("is hidden from a viewer without self.requests, whatever else they hold", () => {
    renderButton();
    expect(screen.queryByRole("button", { name: "Report a problem" })).toBeNull();
  });

  it("files a data error about this page for a holder of self.requests", async () => {
    auth.filesRequests = true;
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole("button", { name: "Report a problem" }));
    expect(screen.getByLabelText("Kind")).toHaveValue("data_error");
    expect(screen.getByRole("dialog")).toHaveTextContent("Frieren");

    await user.type(screen.getByLabelText(/description/i), "Wrong cover");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const post = global.fetch.mock.calls.find(([, opts]) => opts?.method === "POST");
    expect(JSON.parse(post[1].body)).toEqual({
      kind: "data_error",
      description: "Wrong cover",
      target_type: "franchise",
      target_id: "f-uuid",
      page_path: "/franchise/7/frieren",
    });
  });
});
