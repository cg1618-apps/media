// The admin Delete page.
//
// Regression cover for the game branch: it deleted the row but fell through to
// the generic "primary deletion" below it, which re-issued the same DELETE
// against an already-gone id and turned a successful delete into an error
// toast.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const showToast = vi.fn();
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast }),
}));

import Delete from "./Delete";

const GAME = {
  system_id: 1,
  public_id: "g-1",
  game_name_en: "Chrono Trigger",
  game_type: "RPG",
  franchise_id: null,
  series_id: null,
};

// Every list endpoint the page loads on mount is empty except the games one.
// Deleting the game must hit /api/game/1 exactly once; a second call would be
// the fall-through bug, and the API answers it with a 404.
function installFetch() {
  const deleted = new Set();
  const fetchMock = vi.fn(async (url, opts = {}) => {
    if (opts.method === "DELETE") {
      const already = deleted.has(url);
      deleted.add(url);
      return {
        ok: !already,
        status: already ? 404 : 200,
        json: async () => ({}),
      };
    }
    const body = String(url).startsWith("/api/game/") ? [GAME] : [];
    return { ok: true, status: 200, json: async () => body };
  });
  globalThis.fetch = fetchMock;
  return fetchMock;
}

describe("Delete page - game entries", () => {
  beforeEach(() => {
    showToast.mockClear();
  });

  it("reports success and issues one DELETE when a game is deleted", async () => {
    const fetchMock = installFetch();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Delete />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: /game/i }));
    await user.type(
      screen.getByPlaceholderText(/search game to delete/i),
      "Chrono",
    );
    await user.click(await screen.findByText("Chrono Trigger"));
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    await user.click(
      await screen.findByRole("button", { name: /confirm delete/i }),
    );

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith("success", "Deletion successful"),
    );
    expect(showToast).not.toHaveBeenCalledWith("error", expect.anything());
    const gameDeletes = fetchMock.mock.calls.filter(
      ([url, opts]) => opts?.method === "DELETE" && url === "/api/game/1",
    );
    expect(gameDeletes).toHaveLength(1);
  });
});

// Franchise and series are the two group tabs. Their Delete button used to run
// the delete straight away, cascading over every child, with no modal at all.
// The button must only open the confirmation; nothing is deleted until
// Confirm Delete is pressed.
const FRANCHISE = { system_id: 7, public_id: "f-7", franchise_name_en: "Zelda" };
const SERIES = {
  system_id: 8,
  public_id: "s-8",
  series_name_en: "Oracle Games",
  franchise_id: null,
};

function installGroupFetch() {
  const fetchMock = vi.fn(async (url, opts = {}) => {
    if (opts.method === "DELETE") {
      return { ok: true, status: 200, json: async () => ({}) };
    }
    const u = String(url);
    const body = u.startsWith("/api/franchise/")
      ? [FRANCHISE]
      : u.startsWith("/api/series/")
        ? [SERIES]
        : [];
    return { ok: true, status: 200, json: async () => body };
  });
  globalThis.fetch = fetchMock;
  return fetchMock;
}

const deletesOf = (fetchMock) =>
  fetchMock.mock.calls.filter(([, opts]) => opts?.method === "DELETE");

describe.each([
  ["franchise", "Zelda", "/api/franchise/7"],
  ["series", "Oracle Games", "/api/series/8"],
])("Delete page - %s tab", (type, title, url) => {
  beforeEach(() => {
    showToast.mockClear();
  });

  it("deletes nothing until the confirmation is accepted", async () => {
    const fetchMock = installGroupFetch();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Delete />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: /structure/i }));
    await user.click(
      screen.getByRole("button", { name: new RegExp(`^${type}$`, "i") }),
    );
    await user.type(
      screen.getByPlaceholderText(new RegExp(`search ${type} to delete`, "i")),
      title.slice(0, 4),
    );
    await user.click(await screen.findByText(title));
    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    const confirm = await screen.findByRole("button", {
      name: /confirm delete/i,
    });
    expect(deletesOf(fetchMock)).toHaveLength(0);

    await user.click(confirm);
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith("success", "Deletion successful"),
    );
    expect(deletesOf(fetchMock).map(([u]) => u)).toEqual([url]);
  });

  it("deletes nothing when the confirmation is cancelled", async () => {
    const fetchMock = installGroupFetch();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Delete />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: /structure/i }));
    await user.click(
      screen.getByRole("button", { name: new RegExp(`^${type}$`, "i") }),
    );
    await user.type(
      screen.getByPlaceholderText(new RegExp(`search ${type} to delete`, "i")),
      title.slice(0, 4),
    );
    await user.click(await screen.findByText(title));
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    await user.click(await screen.findByRole("button", { name: /^cancel$/i }));

    expect(
      screen.queryByRole("button", { name: /confirm delete/i }),
    ).not.toBeInTheDocument();
    expect(deletesOf(fetchMock)).toHaveLength(0);
  });
});
