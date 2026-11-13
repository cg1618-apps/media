// Login sends the visitor to ?next= after a successful sign-in. It already
// refuses a next that does not start with "/" (an absolute URL would be an
// open redirect). It must also refuse one that points back at /login: such a
// next lands an authenticated visitor on the login form again, with the page
// they actually wanted buried one level further down, and Login has no
// already-signed-in bounce to rescue them from it.
//
// It reaches that destination with a FULL PAGE LOAD, not a client-side
// navigate: everything the SPA cached a moment ago it cached as a guest.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Login from "./Login";
import { SAVED_USERS_KEY, readSavedUsers } from "../../lib/savedUsers";

const { hardNavigate } = vi.hoisted(() => ({ hardNavigate: vi.fn() }));
vi.mock("../../lib/hardNavigate", () => ({ hardNavigate }));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ refetchAuth: vi.fn() }),
}));
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

beforeEach(() => {
  hardNavigate.mockClear();
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

async function signIn(route) {
  render(
    <MemoryRouter initialEntries={[route]}>
      <Login />
    </MemoryRouter>,
  );
  await userEvent.type(screen.getByLabelText(/username/i), "someone");
  await userEvent.type(screen.getByLabelText(/password/i), "a-test-value");
  await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
}

describe("Login - where ?next= is allowed to send you", () => {
  it("honours a next naming a real page", async () => {
    await signIn("/login?next=%2Fstatistics");
    expect(hardNavigate).toHaveBeenCalledWith("/statistics");
  });

  it("refuses a next pointing back at /login", async () => {
    await signIn("/login?next=%2Flogin%3Fnext%3D%252Fstatistics");
    expect(hardNavigate).toHaveBeenCalledWith("/system");
  });

  it("refuses a bare /login next", async () => {
    await signIn("/login?next=%2Flogin");
    expect(hardNavigate).toHaveBeenCalledWith("/system");
  });

  it("still refuses an absolute URL", async () => {
    await signIn("/login?next=https%3A%2F%2Felsewhere.example%2Fx");
    expect(hardNavigate).toHaveBeenCalledWith("/system");
  });
});

// The saved-user row is a quick-swap convenience: sign out, click your name,
// type your password. It stores usernames only, and only for sign-ins that
// actually succeeded.
function renderLogin() {
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <Login />
    </MemoryRouter>,
  );
}

function saveUsers(names) {
  localStorage.setItem(SAVED_USERS_KEY, JSON.stringify(names));
}

describe("Login - saved users", () => {
  it("shows nothing when no username has been saved", () => {
    renderLogin();
    expect(screen.queryByText(/saved users/i)).not.toBeInTheDocument();
  });

  it("lists the saved usernames", () => {
    saveUsers(["admin", "cgent"]);
    renderLogin();
    expect(screen.getByRole("button", { name: /use admin/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /use cgent/i })).toBeInTheDocument();
  });

  it("fills the username and moves focus to the password on a click", async () => {
    saveUsers(["cgent"]);
    renderLogin();
    await userEvent.click(screen.getByRole("button", { name: /use cgent/i }));
    expect(screen.getByLabelText(/username/i)).toHaveValue("cgent");
    // The password is the only thing still missing, so that is where the
    // cursor belongs - clicking a name should leave nothing to do but type.
    expect(screen.getByLabelText(/password/i)).toHaveFocus();
  });

  it("removes a saved username, from the page and from storage", async () => {
    saveUsers(["admin", "cgent"]);
    renderLogin();
    await userEvent.click(screen.getByRole("button", { name: /remove cgent/i }));
    expect(screen.queryByRole("button", { name: /use cgent/i })).not.toBeInTheDocument();
    expect(readSavedUsers()).toEqual(["admin"]);
  });

  it("drops the whole row once the last saved username is removed", async () => {
    saveUsers(["admin"]);
    renderLogin();
    await userEvent.click(screen.getByRole("button", { name: /remove admin/i }));
    expect(screen.queryByText(/saved users/i)).not.toBeInTheDocument();
  });

  it("remembers the username after a successful sign-in", async () => {
    await signIn("/login");
    expect(readSavedUsers()).toEqual(["someone"]);
  });

  it("remembers nothing when the sign-in fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({ ok: false, json: () => Promise.resolve({ detail: "nope" }) }),
      ),
    );
    await signIn("/login");
    // A typo must not spend one of the three slots.
    expect(readSavedUsers()).toEqual([]);
  });

  it("does not save a fourth username over three that are already kept", async () => {
    saveUsers(["admin", "cgent", "guest"]);
    await signIn("/login");
    expect(readSavedUsers()).toEqual(["admin", "cgent", "guest"]);
  });
});

// What a refused sign-in says. The server's detail is shown as it comes, so
// a pending or disabled account and a rate-limited visitor each learn what
// is actually wrong.
describe("Login - refusals", () => {
  function refuse(status, detail) {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({ ok: false, status, json: () => Promise.resolve({ detail }) }),
      ),
    );
  }

  it("shows the pending account's 403", async () => {
    refuse(403, "Your account is waiting for the admin's approval.");
    await signIn("/login");
    expect(
      await screen.findByText("Your account is waiting for the admin's approval."),
    ).toBeInTheDocument();
    expect(hardNavigate).not.toHaveBeenCalled();
  });

  it("shows the disabled account's 403", async () => {
    refuse(403, "This account is disabled.");
    await signIn("/login");
    expect(await screen.findByText("This account is disabled.")).toBeInTheDocument();
  });

  it("shows the 429 with how long to wait", async () => {
    refuse(429, "Too many attempts. Try again in 12 minutes.");
    await signIn("/login");
    expect(
      await screen.findByText("Too many attempts. Try again in 12 minutes."),
    ).toBeInTheDocument();
  });
});

describe("Login - ?username= pre-fills", () => {
  it("fills the username from the query string", () => {
    render(
      <MemoryRouter initialEntries={["/login?username=kana"]}>
        <Login />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText(/username/i)).toHaveValue("kana");
  });

  it("starts empty without one", () => {
    renderLogin();
    expect(screen.getByLabelText(/username/i)).toHaveValue("");
  });

  it("still lets a saved username replace the pre-filled one", async () => {
    saveUsers(["cgent"]);
    render(
      <MemoryRouter initialEntries={["/login?username=kana"]}>
        <Login />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: /use cgent/i }));
    expect(screen.getByLabelText(/username/i)).toHaveValue("cgent");
  });
});

// The site cannot reach anyone, so "forgot" is a note pointing at the admin,
// not a form - and not a link to /reset, which needs a code only the admin
// can hand out.
describe("Login - forgot your password or username", () => {
  it("keeps the note closed until asked", () => {
    renderLogin();
    expect(screen.queryByText(/ask the admin for a reset link/i)).not.toBeInTheDocument();
  });

  it("opens and closes the note", async () => {
    renderLogin();
    const toggle = screen.getByRole("button", {
      name: "Forgot your password or username?",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/ask the admin for a reset link/i)).toBeInTheDocument();
    expect(screen.getByText(/shows your username/i)).toBeInTheDocument();

    await userEvent.click(toggle);
    expect(screen.queryByText(/ask the admin for a reset link/i)).not.toBeInTheDocument();
  });

  it("offers no form and no link to /reset", async () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/login"]}>
        <Login />
      </MemoryRouter>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Forgot your password or username?" }),
    );
    // The note is open, and still the sign-in form is the only form and
    // nothing on the page is a link.
    expect(screen.getByText(/ask the admin for a reset link/i)).toBeInTheDocument();
    expect(container.querySelectorAll("form")).toHaveLength(1);
    expect(container.querySelector('a[href*="/reset"]')).toBeNull();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
