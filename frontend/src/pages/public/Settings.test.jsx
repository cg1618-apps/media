// The settings page of a signed-in member: which account this is and the role
// it holds, read from the server, and the password card for an account
// holding self.password. The only write the page may send is the password
// change - never a settings write.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "../../hooks/useToast";
import Settings from "./Settings";

// What the session holds. Each test that cares sets it; the default holds
// everything, so the account tests see the page a member sees.
const auth = vi.hoisted(() => ({ has: () => true }));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => auth,
}));

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
    auth.has = () => true;
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

describe("Settings - the password card", () => {
  let passwordAnswer;

  beforeEach(() => {
    passwordAnswer = {
      ok: true,
      status: 200,
      json: async () => ({ message: "Password changed." }),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (url === "/api/account/password") return passwordAnswer;
        return { ok: true, status: 200, json: async () => ACCOUNT };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function fill(current, next, again) {
    await userEvent.type(await screen.findByLabelText("Current password"), current);
    await userEvent.type(screen.getByLabelText("New password"), next);
    await userEvent.type(screen.getByLabelText("New password again"), again);
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
  }

  function passwordCalls() {
    return global.fetch.mock.calls.filter(([url]) => url === "/api/account/password");
  }

  it("is not shown without self.password, even holding everything else", async () => {
    // has() answers yes to every other permission, so the card's absence is
    // the self.password check refusing - not an empty permission set.
    auth.has = (permission) => permission !== "self.password";
    renderPage();
    await screen.findByText("kana");
    expect(screen.queryByText("Password")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();
  });

  it("is shown with self.password", async () => {
    auth.has = () => true;
    renderPage();
    expect(await screen.findByLabelText("Current password")).toBeInTheDocument();
  });

  it("sends the current and new password and says you stay signed in", async () => {
    auth.has = () => true;
    renderPage();
    await fill("old-one", "new-one", "new-one");

    await waitFor(() => expect(passwordCalls()).toHaveLength(1));
    const [, opts] = passwordCalls()[0];
    expect(opts.method).toBe("PUT");
    expect(JSON.parse(opts.body)).toEqual({
      current_password: "old-one",
      new_password: "new-one",
    });
    expect(await screen.findByText(/you stay signed in/i)).toBeInTheDocument();
  });

  it("sends nothing when the two new passwords differ", async () => {
    auth.has = () => true;
    renderPage();
    await fill("old-one", "new-one", "new-two");

    expect(await screen.findByText(/do not match/)).toBeInTheDocument();
    expect(passwordCalls()).toHaveLength(0);
  });

  it("shows the server's answer to a wrong current password", async () => {
    auth.has = () => true;
    passwordAnswer = {
      ok: false,
      status: 400,
      json: async () => ({ detail: "Your current password is not right." }),
    };
    renderPage();
    await fill("wrong", "new-one", "new-one");

    expect(
      await screen.findByText("Your current password is not right."),
    ).toBeInTheDocument();
  });
});
