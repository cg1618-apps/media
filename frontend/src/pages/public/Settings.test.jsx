// The settings page of a signed-in member: which account this is and the role
// it holds, read from the server. There is nothing to write any more, so the
// page must never send one.
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "../../hooks/useToast";
import Settings from "./Settings";

const ACCOUNT = { username: "kana", role_name: "user" };

// ToastProvider, as every other page test in this tree does it: useToast reads
// a context and returns null outside the provider.
function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <Settings />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe("Settings", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ACCOUNT })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the account it is about and its role", async () => {
    renderPage();
    expect(await screen.findByText("kana")).toBeInTheDocument();
    expect(screen.getByText("user")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/account/settings",
      expect.anything(),
    );
  });

  it("offers no visibility switch and links to no profile", async () => {
    renderPage();
    await screen.findByText("kana");
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(
      global.fetch.mock.calls.some(([, opts]) => opts?.method === "PATCH"),
    ).toBe(false);
  });
});
