// The admin Delete page.
//
// Regression cover for the game branch: it deleted the row but fell through to
// the generic "primary deletion" below it, which re-issued the same DELETE
// against an already-gone id and turned a successful delete into an error
// toast.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const showToast = vi.fn();
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast }),
}));

import Delete from "./Delete";

// The group tabs read their members through TanStack Query, so the page needs
// a client. A fresh one per render keeps one test's cache out of the next.
function renderDelete() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Delete />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

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
    renderDelete();

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
    renderDelete();

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
    renderDelete();

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

// The group tabs read what a collection, franchise or series holds from the
// server, filtered by its id, rather than from the page's entry lists - which
// on these tabs are never loaded. So this mock answers a filtered list call
// with the members below and an unfiltered one with nothing: a page still
// reading its client lists would see an empty franchise and delete nothing.
const COLLECTION = {
  system_id: 3,
  public_id: 30,
  collection_name_en: "Studio Ghibli",
};
const MEMBER_FRANCHISE = {
  system_id: 7,
  public_id: 70,
  franchise_name_en: "Totoro",
  collection_id: 3,
};
const GROUP = {
  system_id: 7,
  public_id: 70,
  franchise_name_en: "Chrono",
};
const GROUP_SERIES = {
  system_id: 8,
  public_id: 80,
  series_name_en: "Chrono Mainline",
  franchise_id: 7,
};
const MEMBER_ANIME = {
  system_id: 11,
  public_id: 110,
  anime_name_en: "Chrono Crusade",
  franchise_id: 7,
  series_id: 8,
};
const MEMBER_GAME = {
  system_id: 12,
  public_id: 120,
  game_name_en: "Chrono Cross",
  franchise_id: 7,
  series_id: 8,
};
const MEMBER_HGAME = {
  system_id: 13,
  public_id: 130,
  h_game_name_en: "Chrono Hidden",
  franchise_id: 7,
  series_id: 8,
};

// An anime in the franchise but in none of its series: with it, the series
// is not the franchise's last holder, so no orphan offer.
const STANDALONE_ANIME = {
  system_id: 14,
  public_id: 140,
  anime_name_en: "Chrono Side Story",
  franchise_id: 7,
  series_id: null,
};

function installMemberFetch({ failDelete, standalone = false } = {}) {
  const fetchMock = vi.fn(async (url, opts = {}) => {
    const u = String(url);
    if (opts.method === "DELETE") {
      const ok = u !== failDelete;
      return { ok, status: ok ? 200 : 500, json: async () => ({}) };
    }
    const [path, qs = ""] = u.split("?");
    const params = new URLSearchParams(qs);
    let body = [];
    if (path === "/api/collection/") body = [COLLECTION];
    else if (path === "/api/franchise/")
      body = params.get("collection_id") === "3" ? [MEMBER_FRANCHISE] : [GROUP];
    else if (path === "/api/series/") body = [GROUP_SERIES];
    else if (params.get("franchise_id") === "7" || params.get("series_id") === "8") {
      if (path === "/api/anime/")
        body =
          standalone && params.get("franchise_id") === "7"
            ? [MEMBER_ANIME, STANDALONE_ANIME]
            : [MEMBER_ANIME];
      if (path === "/api/game/") body = [MEMBER_GAME];
      if (path === "/api/h-game/") body = [MEMBER_HGAME];
    }
    return { ok: true, status: 200, json: async () => body };
  });
  globalThis.fetch = fetchMock;
  return fetchMock;
}

async function pickGroup(user, type, query, title) {
  await user.click(await screen.findByRole("button", { name: /structure/i }));
  await user.click(
    screen.getByRole("button", { name: new RegExp(`^${type}$`, "i") }),
  );
  await user.type(
    screen.getByPlaceholderText(new RegExp(`search ${type} to delete`, "i")),
    query,
  );
  await user.click(await screen.findByText(title));
}

describe("Delete page - collection tab", () => {
  beforeEach(() => {
    showToast.mockClear();
  });

  it("searches collections and deletes only the collection, on confirm", async () => {
    const fetchMock = installMemberFetch();
    const user = userEvent.setup();
    renderDelete();

    await pickGroup(user, "collection", "Ghib", "Studio Ghibli");
    // The card names its member franchises, read by collection_id.
    expect(await screen.findByText("Totoro")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([u]) =>
        String(u).startsWith("/api/franchise/?collection_id=3"),
      ),
    ).toBe(true);

    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    const confirm = await screen.findByRole("button", {
      name: /confirm delete/i,
    });
    expect(
      screen.getByText(/memes, notes and watch orders are deleted with it/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/1 franchise\(s\) become uncollected/i)).toBeInTheDocument();
    expect(deletesOf(fetchMock)).toHaveLength(0);

    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith("success", "Deletion successful"),
    );
    expect(deletesOf(fetchMock).map(([u]) => u)).toEqual(["/api/collection/3"]);
  });
});

describe("Delete page - franchise members", () => {
  beforeEach(() => {
    showToast.mockClear();
  });

  it("shows a count per media type and names every member", async () => {
    installMemberFetch();
    const user = userEvent.setup();
    renderDelete();

    await pickGroup(user, "franchise", "Chro", "Chrono");

    // Game and h-game were missing from the counts; they must be there.
    expect(await screen.findByText("Chrono Cross")).toBeInTheDocument();
    expect(screen.getByText("Chrono Crusade")).toBeInTheDocument();
    expect(screen.getByText("Chrono Hidden")).toBeInTheDocument();
    expect(screen.getByText("Chrono Mainline")).toBeInTheDocument();
    const summary = screen.getByTestId("group-member-counts");
    expect(summary).toHaveTextContent("1 Series");
    expect(summary).toHaveTextContent("1 Anime");
    expect(summary).toHaveTextContent("1 Game");
    expect(summary).toHaveTextContent("1 H-Game");
  });

  it("cascades over exactly the members it showed", async () => {
    const fetchMock = installMemberFetch();
    const user = userEvent.setup();
    renderDelete();

    await pickGroup(user, "franchise", "Chro", "Chrono");
    await screen.findByText("Chrono Cross");
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    await user.click(await screen.findByRole("checkbox", { name: /cascade/i }));
    const confirm = screen.getByRole("button", { name: /confirm delete/i });
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith("success", "Deletion successful"),
    );
    expect(deletesOf(fetchMock).map(([u]) => u)).toEqual([
      "/api/anime/11",
      "/api/game/12",
      "/api/h-game/13",
      "/api/series/8",
      "/api/franchise/7",
    ]);
  });

  it("stops at the first child delete that fails and says so", async () => {
    const fetchMock = installMemberFetch({ failDelete: "/api/game/12" });
    const user = userEvent.setup();
    renderDelete();

    await pickGroup(user, "franchise", "Chro", "Chrono");
    await screen.findByText("Chrono Cross");
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    await user.click(await screen.findByRole("checkbox", { name: /cascade/i }));
    const confirm = screen.getByRole("button", { name: /confirm delete/i });
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        "error",
        expect.stringMatching(/Chrono Cross/),
      ),
    );
    expect(showToast).not.toHaveBeenCalledWith("success", expect.anything());
    expect(deletesOf(fetchMock).map(([u]) => u)).toEqual([
      "/api/anime/11",
      "/api/game/12",
    ]);
  });
});

describe("Delete page - series members", () => {
  beforeEach(() => {
    showToast.mockClear();
  });

  it("counts every media type but never asks anime-movie for a series", async () => {
    const fetchMock = installMemberFetch();
    const user = userEvent.setup();
    renderDelete();

    await pickGroup(user, "series", "Main", "Chrono Mainline");
    expect(await screen.findByText("Chrono Cross")).toBeInTheDocument();
    const summary = screen.getByTestId("group-member-counts");
    expect(summary).toHaveTextContent("1 Game");
    expect(summary).toHaveTextContent("1 H-Game");
    // anime_movies has no series_id: the endpoint would ignore the filter and
    // answer with every anime movie there is.
    expect(
      fetchMock.mock.calls.some(([u]) =>
        String(u).startsWith("/api/anime-movie/?series_id"),
      ),
    ).toBe(false);
  });
});

describe("Delete page - series orphan franchise", () => {
  beforeEach(() => {
    showToast.mockClear();
  });

  async function openSeriesModal(user) {
    await pickGroup(user, "series", "Main", "Chrono Mainline");
    await screen.findByText("Chrono Cross");
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    return screen.findByRole("button", { name: /confirm delete/i });
  }

  it("offers the parent franchise when this is its last series", async () => {
    const fetchMock = installMemberFetch();
    const user = userEvent.setup();
    renderDelete();

    const confirm = await openSeriesModal(user);
    await user.click(
      await screen.findByRole("checkbox", { name: /last series in franchise/i }),
    );
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith("success", "Deletion successful"),
    );
    expect(deletesOf(fetchMock).map(([u]) => u)).toEqual([
      "/api/series/8",
      "/api/franchise/7",
    ]);
  });

  it("does not offer it while the franchise holds an entry outside the series", async () => {
    // STANDALONE_ANIME is what makes this refusal bite: without it the
    // franchise is empty but for the series, and the offer is correct.
    const fetchMock = installMemberFetch({ standalone: true });
    const user = userEvent.setup();
    renderDelete();

    await openSeriesModal(user);
    await screen.findByRole("checkbox", { name: /cascade/i });
    // The parent's members are read when the series is picked; give the last
    // of them time to land before asserting the offer stayed away.
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([u]) =>
          String(u).startsWith("/api/hentai/?franchise_id=7"),
        ),
      ).toBe(true),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(
      screen.queryByRole("checkbox", { name: /last series in franchise/i }),
    ).not.toBeInTheDocument();
  });
});
