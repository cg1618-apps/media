// /reset is where an admin-issued reset link lands. The page must show a form
// ONLY for a code the server accepts - one message for every unusable link -
// and, once the password is set, leave by a full page load to the sign-in
// page with the username filled in: the server has just cleared this
// browser's login cookies, and everything cached was cached before that.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ResetPassword from "./ResetPassword";

const { hardNavigate } = vi.hoisted(() => ({ hardNavigate: vi.fn() }));
vi.mock("../../lib/hardNavigate", () => ({ hardNavigate }));

const INVALID = "This link is not valid. Ask the admin for a new one.";

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
  hardNavigate.mockClear();
  getAnswer = () => answer(200, { username: "kana" });
  postAnswer = () => answer(200, { username: "kana" });
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
      <ResetPassword />
    </MemoryRouter>,
  );
}

async function submit(password, again) {
  await userEvent.type(await screen.findByLabelText("New password"), password);
  await userEvent.type(screen.getByLabelText("New password again"), again);
  await userEvent.click(screen.getByRole("button", { name: "Save password" }));
}

function posts() {
  return global.fetch.mock.calls.filter(([, opts]) => opts?.method === "POST");
}

describe("ResetPassword", () => {
  it("shows only the message, and asks nothing, without a code", () => {
    renderAt("/reset");
    expect(screen.getByText(INVALID)).toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows only the server's message for a code it refuses", async () => {
    getAnswer = () => answer(404, { detail: INVALID });
    renderAt("/reset?code=spent");
    expect(await screen.findByText(INVALID)).toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    expect(screen.queryByText(/setting a new password/i)).not.toBeInTheDocument();
  });

  it("asks the server about the code without spending it", async () => {
    renderAt("/reset?code=abc");
    await screen.findByLabelText("New password");
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/auth/reset?code=abc");
    expect(opts?.method).toBeUndefined();
  });

  it("names the account and offers the form for a usable code", async () => {
    renderAt("/reset?code=abc");
    expect(await screen.findByText("kana")).toBeInTheDocument();
    expect(screen.getByText(/setting a new password for/i)).toBeInTheDocument();
    expect(screen.getByLabelText("New password again")).toBeInTheDocument();
  });

  it("sends nothing when the two passwords differ", async () => {
    renderAt("/reset?code=abc");
    await submit("one", "two");
    expect(await screen.findByText(/do not match/)).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it("spends the code and loads sign-in with the username filled in", async () => {
    renderAt("/reset?code=abc");
    await submit("new-one", "new-one");

    await waitFor(() =>
      expect(hardNavigate).toHaveBeenCalledWith("/login?username=kana"),
    );
    const [url, opts] = posts()[0];
    expect(url).toBe("/api/auth/reset");
    expect(JSON.parse(opts.body)).toEqual({ code: "abc", password: "new-one" });
  });

  it("shows the server's refusal and stays on the page", async () => {
    postAnswer = () =>
      answer(422, { detail: "A password can be at most 72 bytes; this one is 80." });
    renderAt("/reset?code=abc");
    await submit("new-one", "new-one");

    expect(await screen.findByText(/at most 72 bytes/)).toBeInTheDocument();
    expect(hardNavigate).not.toHaveBeenCalled();
  });
});
