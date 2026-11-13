// /register is where an admin-issued invite link lands. The page must show a
// form ONLY for a code the server accepts - one message for every unusable
// link - send nothing while the two passwords differ, end on the waiting-for-
// approval message, and show the server's own sentence for every refusal.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Register from "./Register";

const INVALID = "This link is not valid. Ask the admin for a new one.";
const WAITING = "Your account is waiting for the admin's approval.";

function answer(status, body) {
  return Promise.resolve({
    ok: status < 400,
    status,
    statusText: "",
    json: () => Promise.resolve(body),
  });
}

let getAnswer;
let postAnswer;

beforeEach(() => {
  getAnswer = () => answer(200, { valid: true });
  postAnswer = () => answer(201, { username: "kana" });
  vi.stubGlobal(
    "fetch",
    vi.fn((url, opts = {}) => (opts.method === "POST" ? postAnswer() : getAnswer())),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderAt(route) {
  render(
    <MemoryRouter initialEntries={[route]}>
      <Register />
    </MemoryRouter>,
  );
}

async function submit(username, password, again) {
  await userEvent.type(await screen.findByLabelText("Username"), username);
  await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.type(screen.getByLabelText("Password again"), again);
  await userEvent.click(screen.getByRole("button", { name: "Register" }));
}

function posts() {
  return global.fetch.mock.calls.filter(([, opts]) => opts?.method === "POST");
}

describe("Register", () => {
  it("shows only the message, and asks nothing, without a code", () => {
    renderAt("/register");
    expect(screen.getByText(INVALID)).toBeInTheDocument();
    expect(screen.queryByLabelText("Username")).not.toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows only the server's message for a code it refuses", async () => {
    getAnswer = () => answer(404, { detail: INVALID });
    renderAt("/register?code=spent");
    expect(await screen.findByText(INVALID)).toBeInTheDocument();
    expect(screen.queryByLabelText("Username")).not.toBeInTheDocument();
  });

  it("asks the server about the code without spending it", async () => {
    renderAt("/register?code=abc");
    await screen.findByLabelText("Username");
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/auth/register?code=abc");
    expect(opts?.method).toBeUndefined();
  });

  it("states the username rules beside the field", async () => {
    renderAt("/register?code=abc");
    expect(await screen.findByLabelText("Username")).toHaveAccessibleDescription(
      /3–32 characters.*admin.*guest/,
    );
  });

  it("sends nothing when the two passwords differ", async () => {
    renderAt("/register?code=abc");
    await submit("kana", "one", "two");
    expect(await screen.findByText(/do not match/)).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it("spends the code and says the account waits for approval", async () => {
    renderAt("/register?code=abc");
    await submit("kana", "new-one", "new-one");

    expect(await screen.findByText(WAITING)).toBeInTheDocument();
    expect(screen.queryByLabelText("Username")).not.toBeInTheDocument();
    const [url, opts] = posts()[0];
    expect(url).toBe("/api/auth/register");
    expect(JSON.parse(opts.body)).toEqual({
      code: "abc",
      username: "kana",
      password: "new-one",
    });
  });

  for (const [status, detail] of [
    [409, "That username is taken."],
    [422, "A username may not contain admin."],
    [429, "Too many attempts. Try again in 5 minutes."],
  ]) {
    it(`shows the server's ${status} detail and keeps the form`, async () => {
      postAnswer = () => answer(status, { detail });
      renderAt("/register?code=abc");
      await submit("kana", "new-one", "new-one");

      expect(await screen.findByText(detail)).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Register" })).toBeEnabled(),
      );
      expect(screen.queryByText(WAITING)).not.toBeInTheDocument();
    });
  }
});
