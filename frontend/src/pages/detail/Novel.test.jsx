// Novel detail page: renders novel_units (Task 8/9's `units` relationship)
// instead of the retired novel_name_each_cn/_en parallel lists, using each
// unit's server-computed display_key.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../../contexts/AuthContext";
import { ToastProvider } from "../../hooks/useToast";
import Novel from "./Novel";

const BASE_NOVEL = {
  system_id: "n1",
  novel_name_cn: "測試小說",
  novel_name_en: "Test Novel",
  novel_name_roman: null,
  novel_name_jp: null,
  novel_name_alt: null,
  franchise_id: null,
  series_id: null,
  region: "JP",
  type: "Web",
  serialization_status: "連載中",
  reading_status: "Reading",
  progress_display: null,
  vol_total_original: null,
  vol_total_tw: null,
  vol_fin: 0,
  arc_total: null,
  arc_fin: 0,
  ch_total: null,
  ch_fin: 0,
  my_rating: null,
  cover_image_file: null,
  remark: null,
  units: [],
};

const MEMBER_VIEW = ["view.entities", "view.search", "view.extras", "self.list"];
// What /api/auth/me grants the non-admin viewer; a guest case sets [].
let viewPermissions = MEMBER_VIEW;

function respond(url, isAdmin, isRoot = isAdmin) {
  const u = String(url);
  if (u.startsWith("/api/auth/me")) {
    return {
      is_admin: isAdmin,
      username: isAdmin ? "admin" : "reader",
      role: isAdmin ? "admin" : "user",
      is_root: isRoot,
      // A member's keys by default: entity names link (view.entities) and a
      // unit's remark, the viewer's own, is shown (self.list). The guest view of the
      // links is pinned in CastSection.test and StudioLinks.test, and of the
      // remark below.
      permissions: viewPermissions,
    };
  }
  return [];
}

function mockFetch(novel, { isAdmin = false, isRoot = isAdmin, onPatch, onUnitPut } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url, options) => {
      const u = String(url);
      if (u.startsWith("/api/me/novel-units/") && options?.method === "PUT") {
        const body = JSON.parse(options.body);
        const unitId = u.slice("/api/me/novel-units/".length);
        onUnitPut?.(unitId, body);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ unit_id: unitId, my_rating: null, remark: null, ...body }),
        });
      }
      if (u.startsWith("/api/novel/n1")) {
        if (options?.method === "PATCH") {
          const body = JSON.parse(options.body);
          onPatch?.(body);
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ ...novel, ...body }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(novel),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(respond(u, isAdmin, isRoot)),
      });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  viewPermissions = MEMBER_VIEW;
});

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={["/novel/n1"]}>
            <Routes>
              <Route path="/novel/:publicId/:slug?" element={<Novel />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Novel detail page — units", () => {
  it("renders a unit's server-provided display_key even with no key or name", async () => {
    mockFetch({
      ...BASE_NOVEL,
      units: [
        {
          system_id: "u1",
          unit_kind: "arc",
          position: 1,
          unit_key: null,
          name_cn: null,
          name_en: null,
          remark: null,
          ch_count: 100,
          display_key: "Arc 1",
        },
      ],
    });
    mount();
    expect(await screen.findByText("Arc 1")).toBeInTheDocument();
    expect(screen.getByText("100 ch")).toBeInTheDocument();
  });

  it("renders a named unit's key alongside its title and the viewer's own rating and remark", async () => {
    mockFetch({
      ...BASE_NOVEL,
      type: "Light Novel",
      units: [
        {
          system_id: "u1",
          unit_kind: "volume",
          position: 1,
          unit_key: "Vol.1",
          name_cn: "第一卷",
          name_en: "Volume One",
          remark: "Limited edition",
          my_rating: "A",
          ch_count: null,
          display_key: "Vol.1",
        },
      ],
    });
    mount();
    expect(await screen.findByText("Vol.1")).toBeInTheDocument();
    expect(screen.getByText("第一卷 / Volume One")).toBeInTheDocument();
    expect(await screen.findByLabelText("My remark for Vol.1")).toHaveValue("Limited edition");
    expect(screen.getByLabelText("My rating for Vol.1")).toHaveValue("A");
  });

  it("saves a member's unit rating on change and remark on blur through /api/me", async () => {
    const puts = [];
    let patched = false;
    mockFetch(
      {
        ...BASE_NOVEL,
        units: [
          {
            system_id: "u1",
            unit_kind: "arc",
            position: 1,
            unit_key: null,
            name_cn: null,
            name_en: null,
            remark: null,
            my_rating: null,
            ch_count: 10,
            display_key: "Arc 1",
          },
        ],
      },
      { onUnitPut: (id, body) => puts.push([id, body]), onPatch: () => (patched = true) },
    );
    const user = userEvent.setup();
    mount();

    await user.selectOptions(await screen.findByLabelText("My rating for Arc 1"), "A+");
    await waitFor(() => expect(puts).toEqual([["u1", { my_rating: "A+" }]]));

    const remark = screen.getByLabelText("My remark for Arc 1");
    await user.type(remark, "best arc");
    expect(puts).toHaveLength(1);
    await user.tab();
    await waitFor(() =>
      expect(puts).toEqual([
        ["u1", { my_rating: "A+" }],
        ["u1", { remark: "best arc" }],
      ]),
    );
    // A blur with nothing changed sends nothing.
    await user.click(remark);
    await user.tab();
    expect(puts).toHaveLength(2);
    // Nothing of it goes through the catalogue write.
    expect(patched).toBe(false);
  });

  it("gives an editor holding self.list the catalogue editor and its own controls", async () => {
    // manage.catalog and self.list together, without the root flag: the
    // super role's shape.
    mockFetch(
      {
        ...BASE_NOVEL,
        units: [
          {
            system_id: "u1",
            unit_kind: "arc",
            position: 1,
            unit_key: null,
            name_cn: null,
            name_en: "Arc Name",
            remark: "mine",
            my_rating: "B",
            ch_count: 10,
            display_key: "Arc 1",
          },
        ],
      },
      { isAdmin: true, isRoot: false },
    );
    mount();
    expect(await screen.findByText(/\+ Add arc/)).toBeInTheDocument();
    expect(await screen.findByText("My ratings")).toBeInTheDocument();
    expect(await screen.findByLabelText("My rating for Arc 1")).toHaveValue("B");
    expect(screen.getByLabelText("My remark for Arc 1")).toHaveValue("mine");
  });

  it("leaves a unit's remark out for a viewer without self.list", async () => {
    // The same unit, remark and all, that the case above draws for a member,
    // and every view.* key: only self.list is missing. Such a viewer has no
    // remark of its own, and the row must not draw one even if it arrives.
    viewPermissions = MEMBER_VIEW.filter((p) => p !== "self.list");
    mockFetch({
      ...BASE_NOVEL,
      type: "Light Novel",
      units: [
        {
          system_id: "u1",
          unit_kind: "volume",
          position: 1,
          unit_key: "Vol.1",
          name_cn: "第一卷",
          name_en: "Volume One",
          remark: "Limited edition",
          ch_count: null,
          display_key: "Vol.1",
        },
      ],
    });
    mount();
    expect(await screen.findByText("第一卷 / Volume One")).toBeInTheDocument();
    // Let /api/auth/me land, so the absence is the permission's doing.
    await waitFor(() =>
      expect(fetch.mock.calls.some(([u]) => String(u).startsWith("/api/auth/me"))).toBe(true),
    );
    await act(async () => {});
    expect(screen.queryByText("Limited edition")).toBeNull();
    expect(screen.queryByDisplayValue("Limited edition")).toBeNull();
    expect(screen.queryByLabelText("My rating for Vol.1")).toBeNull();
    expect(screen.queryByLabelText("My remark for Vol.1")).toBeNull();
  });

  it("does not render an empty Units card for a novel with no units", async () => {
    mockFetch({ ...BASE_NOVEL, units: [] });
    mount();
    // Wait for the page to finish loading before asserting an absence.
    await screen.findByRole("heading", { name: "Test Novel" });
    expect(screen.queryByText("Units")).not.toBeInTheDocument();
  });

  it("shows the genre and label tags on the Genres card", async () => {
    mockFetch({
      ...BASE_NOVEL,
      genre_main: "Fantasy, Romance",
      genre_sub: "Isekai",
      label: "必看",
    });
    mount();
    expect(await screen.findByText("Genre (Main)")).toBeInTheDocument();
    expect(screen.getByText("Fantasy, Romance")).toBeInTheDocument();
    expect(screen.getByText("Genre (Sub)")).toBeInTheDocument();
    expect(screen.getByText("Isekai")).toBeInTheDocument();
    expect(screen.getByText("標籤 Label")).toBeInTheDocument();
    expect(screen.getByText("必看")).toBeInTheDocument();
  });

  it('labels the original-volumes total "JP/KR"', async () => {
    mockFetch({ ...BASE_NOVEL, vol_total_original: 5 });
    mount();
    await waitFor(() =>
      expect(screen.getByText("Total Volumes (JP/KR)")).toBeInTheDocument(),
    );
  });

  it("admin editing a unit and saving PATCHes the units' own fields only and applies the server response", async () => {
    let patchedBody = null;
    mockFetch(
      {
        ...BASE_NOVEL,
        type: "Light Novel",
        units: [
          {
            system_id: "u1",
            unit_kind: "volume",
            position: 1,
            unit_key: "Vol.1",
            name_cn: "第一卷",
            name_en: "Volume One",
            // A read row carries the viewer's own values; the save must not
            // send them back through the catalogue write.
            remark: "someone's",
            my_rating: "S",
            ch_count: null,
            display_key: "Vol.1",
          },
        ],
      },
      { isAdmin: true, onPatch: (body) => (patchedBody = body) },
    );
    // The root flag does not reach the self family: an admin holds no
    // self.list, and keeps no rating or remark of its own.
    viewPermissions = [];
    const user = userEvent.setup();
    mount();

    const nameInput = await screen.findByDisplayValue("Volume One");
    await user.type(nameInput, " Revised");
    // The admin holds no self.list, so it has no personal control at all.
    expect(screen.queryByPlaceholderText("Remark")).toBeNull();
    expect(screen.queryByLabelText(/^My rating for /)).toBeNull();

    const saveButton = await screen.findByRole("button", { name: "Save" });
    await user.click(saveButton);

    await waitFor(() => expect(patchedBody).not.toBeNull());
    expect(patchedBody.units).toHaveLength(1);
    expect(patchedBody.units[0]).toMatchObject({
      system_id: "u1",
      name_en: "Volume One Revised",
    });
    expect(patchedBody.units[0]).not.toHaveProperty("my_rating");
    expect(patchedBody.units[0]).not.toHaveProperty("remark");

    // The Save/Cancel controls disappear once the edit round-trips —
    // proof the page applied the server's response rather than the toast
    // firing over an edit that never left the client (Finding 1).
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument(),
    );
  });
});

describe("Novel detail page — sources", () => {
  it("renders the Open Library link in the Sources card", async () => {
    mockFetch({
      ...BASE_NOVEL,
      openlibrary_link: "https://openlibrary.org/works/OL5738148W",
    });
    mount();
    expect(await screen.findByText("Open Library")).toBeInTheDocument();
  });

  it("renders no Open Library row when the link is absent", async () => {
    mockFetch({ ...BASE_NOVEL, openlibrary_link: null });
    mount();
    await screen.findByRole("heading", { name: "Test Novel" });
    expect(screen.queryByText("Open Library")).not.toBeInTheDocument();
  });
});

describe("Novel detail page — Production", () => {
  // An empty publisher_refs is what bites: `[].length` is 0, and React prints
  // a bare 0 where a false condition prints nothing.
  it("prints no stray zero when nobody is credited", async () => {
    mockFetch({ ...BASE_NOVEL, publisher_refs: [] });
    mount();
    await screen.findByRole("heading", { name: "Test Novel" });
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.queryByText("Production")).toBeNull();
  });
});
