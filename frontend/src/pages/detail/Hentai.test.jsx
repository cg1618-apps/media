// Frontend: the hentai detail page.
//
// Tracked like a cartoon: an episode stepper that finishes the entry at its
// total - and it draws the shared notes page, since the type has no section
// of its own.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../../contexts/AuthContext";
import { ToastProvider, useToast } from "../../hooks/useToast";
import Hentai from "./Hentai";

const REMARK = { key: "remark", shape: "text", label: "Remark", owner_where: {} };

// A member's view.* keys, so credits and the cast link.
const MEMBER_KEYS = ["view.studio", "view.publisher", "view.person", "view.character", "view.search", "view.random_picker"];

// A list holder: the member's keys and self.list, which the tracker follows.
const LIST_KEYS = [...MEMBER_KEYS, "self.list"];

function mockFetch(
  entry,
  cast = [],
  { admin = false, patched = null, listed = null, permissions = MEMBER_KEYS } = {},
) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url, init) => {
      const u = String(url);
      let body = [];
      if (init?.method === "PUT" && u.startsWith("/api/me/remarks/")) {
        body = { remark: JSON.parse(init.body).remark };
      } else if (init?.method === "PUT" && u.startsWith("/api/me/list/")) {
        // The row as /api/me/list answers it, in its envelope.
        const sent = JSON.parse(init.body);
        body = { media_id: entry.system_id, media_type: "hentai", ...(listed ? listed(sent) : sent) };
      } else if (init?.method === "PUT" && u.startsWith("/api/me/plan-flags/")) {
        body = JSON.parse(init.body);
      } else if (init?.method === "PATCH") {
        body = patched ? patched(JSON.parse(init.body)) : entry;
      } else if (u.startsWith("/api/auth/me")) {
        body = {
          is_admin: admin,
          username: "cg1618",
          role: "user",
          permissions,
          visible_gated_types: ["h-comic", "h-game", "hentai"],
        };
      } else if (u.startsWith(`/api/hentai/${entry.system_id}`)) {
        body = entry;
      } else if (u.startsWith(`/api/casting/hentai/${entry.system_id}`)) {
        body = { cast };
      } else if (u.startsWith("/api/notes/sections")) {
        body = [REMARK];
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    })
  );
}

afterEach(() => vi.unstubAllGlobals());

// The provider holds toasts and draws none; this draws them as text.
function Toasts() {
  const { toasts } = useToast();
  return toasts.map((t) => <p key={t.id}>{t.message}</p>);
}

function mount(entry) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <Toasts />
          <MemoryRouter initialEntries={[`/hentai/${entry.system_id}`]}>
            <Routes>
              <Route path="/hentai/:publicId/:slug?" element={<Hentai />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

const ENTRY = {
  system_id: "h1",
  franchise_id: null,
  series_id: null,
  cover_image_file: null,
  sources: [],
  content_labels: [{ key: "hentai", name: "Hentai" }],
  credit_refs: {},
  studio_refs: [],
  hentai_name_cn: "中文名",
  hentai_name_en: "English Name",
  source_material: "Manga",
  originality: "原創",
  airing_status: "Finished Airing",
  release_date: "2020-03",
  watching_status: "Completed",
  ep_total: 2,
  ep_fin: 1,
  usefulness: "實用",
  h_genre_plot: "Plot A",
  mal_link: "https://myanimelist.net/anime/1/x",
  anidb_link: "https://anidb.net/anime/1",
};

describe("Hentai detail page", () => {
  it("draws the entry with its own fields and its episode counter", async () => {
    mockFetch(ENTRY);
    mount(ENTRY);
    await screen.findByRole("heading", { name: "中文名" });
    expect(screen.getByRole("heading", { name: "English Name" })).toBeInTheDocument();
    expect(screen.getByText("Source Material")).toBeInTheDocument();
    expect(screen.getAllByText("Manga").length).toBeGreaterThan(0);
    expect(screen.getByText("Plot A")).toBeInTheDocument();
    // The tracker is the viewer's own and this viewer holds no list (the
    // tracker's tests are below); the total is in the Information card.
    expect(screen.queryByRole("heading", { name: "My tracker" })).toBeNull();
    expect(screen.getByText("Episodes")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /anidb/i })).toHaveAttribute(
      "href",
      "https://anidb.net/anime/1",
    );
  });

  it("credits the author, linked to the person, beside the studio and director", async () => {
    const credited = {
      ...ENTRY,
      author: "Zvornik Writer",
      credit_refs: {
        author: [{ system_id: "p1", public_id: 7, display_name: "Zvornik Writer", label: "Author" }],
      },
    };
    mockFetch(credited);
    mount(credited);
    await screen.findByRole("heading", { name: "中文名" });
    expect(screen.getByText("Author")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Zvornik Writer" })).toBeInTheDocument();
  });

  it("steps the episode counter with a PUT of ep_fin to the viewer's own list", async () => {
    const watching = { ...ENTRY, watching_status: "Active Watching", ep_total: 3, ep_fin: 1 };
    mockFetch(watching, [], { permissions: LIST_KEYS });
    mount(watching);
    const user = userEvent.setup();
    const next = await screen.findByRole("button", { name: "Next episode" });
    expect(next).toBeEnabled();
    await user.click(next);
    await screen.findByText("Episode progress saved");
    const put = fetch.mock.calls.find(
      ([url, init]) => init?.method === "PUT" && String(url).startsWith("/api/me/list/"),
    );
    expect(put[0]).toBe("/api/me/list/h1");
    expect(JSON.parse(put[1].body)).toEqual({ ep_fin: 2 });
    expect(fetch.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
    expect(screen.getByRole("spinbutton", { name: "Episodes finished" })).toHaveValue(2);
  });

  it("says Completed when a step reaches the total", async () => {
    const watching = { ...ENTRY, watching_status: "Active Watching", ep_total: 2, ep_fin: 1 };
    mockFetch(watching, [], {
      permissions: LIST_KEYS,
      // /api/me/list finishes the row when the counter reaches its total.
      listed: (sent) => ({ ...sent, watching_status: "Completed" }),
    });
    mount(watching);
    const user = userEvent.setup();
    const next = await screen.findByRole("button", { name: "Next episode" });
    await user.click(next);
    await screen.findByText("Marked as Completed!");
    expect(screen.getByRole("combobox", { name: "Watching status" })).toHaveValue("Completed");
  });

  it("never steps past the total", async () => {
    const done = { ...ENTRY, ep_total: 2, ep_fin: 2 };
    mockFetch(done, [], { permissions: LIST_KEYS });
    mount(done);
    const user = userEvent.setup();
    const next = await screen.findByRole("button", { name: "Next episode" });
    await user.click(next);
    expect(fetch.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
    expect(fetch.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  });

  it("draws the shared notes page", async () => {
    mockFetch(ENTRY);
    mount(ENTRY);
    await screen.findByRole("heading", { name: "中文名" });
    await screen.findByRole("heading", { name: "Notes" });
    // The shared registry, asked for this type: no section of its own.
    const urls = fetch.mock.calls.map(([url]) => String(url));
    expect(urls).toContain("/api/notes/sections?owner_type=hentai");
  });

  it("draws the cast with each character's seiyuu", async () => {
    mockFetch(ENTRY, [
      {
        system_id: "c1",
        role: "Main",
        position: 0,
        character_name: "Heroine",
        character_public_id: 7,
        voices: [{ person_id: "p1", person_name: "Voice Actor", person_public_id: 9, remark: null }],
      },
    ]);
    mount(ENTRY);
    await screen.findByText("Heroine");
    expect(screen.getByRole("heading", { name: "Cast" })).toBeInTheDocument();
    expect(screen.getByText("voiced by")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voice Actor" })).toBeInTheDocument();
  });

  it("draws no cast slip for an entry with no cast", async () => {
    mockFetch(ENTRY);
    mount(ENTRY);
    await screen.findByRole("heading", { name: "中文名" });
    await screen.findByRole("heading", { name: "Notes" });
    expect(screen.queryByRole("heading", { name: "Cast" })).toBeNull();
  });
});

// The Remarks box is the viewer's own remark: drawn for a holder of self.list
// and written through /api/me/remarks, never the catalogue's PATCH. The entry
// carries a remark in both cases, so the box's absence without self.list is
// the permission's doing and not an empty row's.
describe("Hentai detail page own remark", () => {
  const remarked = { ...ENTRY, remark: "Skip the second episode." };
  const remarkBox = () => screen.queryByPlaceholderText("Add remarks…");
  const putCalls = () =>
    fetch.mock.calls.filter(
      ([url, init]) => init?.method === "PUT" && String(url).startsWith("/api/me/remarks/"),
    );
  const patchCalls = () => fetch.mock.calls.filter(([, init]) => init?.method === "PATCH");

  it("lets a holder of self.list edit it, saved through /api/me/remarks", async () => {
    mockFetch(remarked, [], { permissions: [...MEMBER_KEYS, "self.list"] });
    mount(remarked);
    const box = await screen.findByPlaceholderText("Add remarks…");
    expect(box).toHaveValue("Skip the second episode.");
    expect(box).toBeEnabled();

    await userEvent.clear(box);
    await userEvent.type(box, "Watch both.");
    fireEvent.blur(box);
    await waitFor(() => expect(putCalls()).toHaveLength(1));
    expect(putCalls()[0][0]).toBe("/api/me/remarks/hentai/h1");
    expect(JSON.parse(putCalls()[0][1].body)).toEqual({ remark: "Watch both." });
    expect(await screen.findByText("Remark saved")).toBeInTheDocument();
    expect(patchCalls()).toHaveLength(0);
  });

  it("sends an unchanged remark nowhere", async () => {
    mockFetch(remarked, [], { permissions: ["self.list"] });
    mount(remarked);
    fireEvent.blur(await screen.findByPlaceholderText("Add remarks…"));
    expect(putCalls()).toHaveLength(0);
    expect(patchCalls()).toHaveLength(0);
  });

  it("does not draw the box without self.list", async () => {
    mockFetch(remarked, [], { permissions: [] });
    mount(remarked);
    await screen.findByRole("heading", { name: "中文名" });
    await screen.findByRole("heading", { name: "Notes" });
    expect(remarkBox()).toBeNull();
  });
});

// The tracker slip is the viewer's own row: drawn and enabled for a holder of
// self.list who is not an editor, written through /api/me, never the
// catalogue PATCH. The mirror cases use the same entry, so the slip's absence
// is the permission's doing and not an empty row's.
describe("Hentai detail page own tracker", () => {
  const watching = { ...ENTRY, watching_status: "Active Watching", watch_next: false };
  const puts = (prefix) =>
    fetch.mock.calls.filter(
      ([url, init]) => init?.method === "PUT" && String(url).startsWith(prefix),
    );
  const patches = () => fetch.mock.calls.filter(([, init]) => init?.method === "PATCH");

  it("saves the status through /api/me/list", async () => {
    mockFetch(watching, [], { permissions: LIST_KEYS });
    mount(watching);
    const status = await screen.findByRole("combobox", { name: "Watching status" });
    expect(status).toBeEnabled();
    await userEvent.selectOptions(status, "Paused");
    await screen.findByText("Status updated");
    expect(puts("/api/me/list/")).toHaveLength(1);
    expect(puts("/api/me/list/")[0][0]).toBe("/api/me/list/h1");
    expect(JSON.parse(puts("/api/me/list/")[0][1].body)).toEqual({ watching_status: "Paused" });
    expect(patches()).toHaveLength(0);
  });

  it("saves a plan flag through /api/me/plan-flags", async () => {
    mockFetch(watching, [], { permissions: LIST_KEYS });
    mount(watching);
    await userEvent.click(await screen.findByRole("checkbox", { name: "Watch next" }));
    await screen.findByText("Added to Watch Next");
    expect(puts("/api/me/plan-flags/")).toHaveLength(1);
    expect(puts("/api/me/plan-flags/")[0][0]).toBe("/api/me/plan-flags/h1");
    expect(JSON.parse(puts("/api/me/plan-flags/")[0][1].body)).toEqual({ watch_next: true });
    expect(puts("/api/me/list/")).toHaveLength(0);
    expect(patches()).toHaveLength(0);
    expect(screen.getByRole("checkbox", { name: "Watch next" })).toBeChecked();
    // The mirror of the "no tracker" cases below: with a list the slip is drawn.
    expect(screen.getByRole("heading", { name: "My tracker" })).toBeInTheDocument();
  });

  it("draws no tracker without self.list", async () => {
    mockFetch(watching, [], { permissions: [] });
    mount(watching);
    await screen.findByRole("heading", { name: "中文名" });
    await screen.findByRole("heading", { name: "Notes" });
    expect(screen.queryByRole("heading", { name: "My tracker" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Watching status" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Watch next" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Next episode" })).toBeNull();
  });

  it("gives an editor without self.list the toolbar but no tracker", async () => {
    mockFetch(watching, [], { admin: true, permissions: ["manage.catalog"] });
    mount(watching);
    expect(await screen.findByRole("button", { name: "Mark completed" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quick edit" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "My tracker" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Watching status" })).toBeNull();
  });
});
