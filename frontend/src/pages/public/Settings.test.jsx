// The one thing a signed-in member can change about their own account.
//
// What matters here is that the toggle reflects the server and writes back to
// it - a switch that only moved locally would tell someone their list was
// public when it was not.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "../../hooks/useToast";
import Settings from "./Settings";

// What the session holds. Each test that cares sets it; the default holds
// everything, so the visibility tests above see the page a member sees.
const auth = vi.hoisted(() => ({ has: () => true }));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => auth,
}));

const PRIVATE = { username: "kana", role_name: "user", list_is_public: false };

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
      vi.fn(async (url, options = {}) => {
        if (options.method === "PATCH") {
          const body = JSON.parse(options.body);
          return {
            ok: true,
            status: 200,
            json: async () => ({ ...PRIVATE, ...body }),
          };
        }
        return { ok: true, status: 200, json: async () => PRIVATE };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the account it is about", async () => {
    renderPage();
    expect(await screen.findByText("kana")).toBeInTheDocument();
  });

  it("starts on the value the server reported", async () => {
    renderPage();
    const toggle = await screen.findByRole("checkbox", {
      name: /make my list public/i,
    });
    expect(toggle).not.toBeChecked();
  });

  it("writes the new value back", async () => {
    renderPage();
    const toggle = await screen.findByRole("checkbox", {
      name: /make my list public/i,
    });
    await userEvent.click(toggle);

    await waitFor(() => {
      const patch = global.fetch.mock.calls.find(
        ([, opts]) => opts?.method === "PATCH",
      );
      expect(patch).toBeTruthy();
      expect(patch[0]).toBe("/api/account/settings");
      expect(JSON.parse(patch[1].body)).toEqual({ list_is_public: true });
    });
    await waitFor(() => expect(toggle).toBeChecked());
  });

  it("says where a public list becomes visible", async () => {
    renderPage();
    expect(await screen.findByText(/\/user\/kana/)).toBeInTheDocument();
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
        return { ok: true, status: 200, json: async () => PRIVATE };
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
