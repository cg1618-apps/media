// The dashboard per viewer (docs/viewers.md, "Dashboard"): which parts each
// viewer is shown, chosen on permissions. Every refusal runs against data that
// WOULD fill the hidden part - summary counts above zero, recent entries, a
// pipeline run - and has a mirror where the same data is drawn, so a pass
// means the permission gate did the hiding.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { AuthProvider } from "../../contexts/AuthContext";
import { ToastProvider } from "../../hooks/useToast";
import {
  LIBRARY_MEDIA_TYPE_PERMISSIONS,
  NAV_SECTIONS,
  sectionItems,
  visibleSections,
} from "../../config/navigation";
import Index from "./Index";

const GUEST_PERMS = [...LIBRARY_MEDIA_TYPE_PERMISSIONS, "view.search"];
const SHARED_PERMS = [...GUEST_PERMS, "view.random_picker", "self.requests"];
const USER_PERMS = [...GUEST_PERMS, "view.random_picker", "self.list", "self.requests"];
const SUPER_PERMS = [
  ...USER_PERMS,
  "view.studio",
  "view.person",
  "manage.catalog",
  "manage.requests",
  "manage.pipelines",
  "manage.announcements",
];
const ADMIN_PERMS = [
  "admin.authz",
  "manage.pipelines",
  "manage.requests",
  "manage.announcements",
  "manage.options",
  "manage.images",
  "manage.resources",
];

function me(role, permissions, extra = {}) {
  return {
    is_admin: permissions.includes("manage.catalog"),
    username: role === "guest" ? null : role,
    role,
    permissions,
    visible_gated_types: [],
    features: [],
    ...extra,
  };
}

const RECENT = [
  {
    system_id: "r1",
    media_type: "anime",
    public_id: 7,
    display_name: "Dungeon Meshi",
    cover_image_file: null,
    cover_image_focus: null,
    created_at: "2026-11-01T00:00:00Z",
  },
];
const LOGS = [
  {
    id: 1,
    action_main: "Backup",
    action_specific: "All tabs",
    type: "Manual",
    status: "Success",
    rows_added: 0,
    rows_updated: 0,
    rows_deleted: 0,
    timestamp: "2026-11-13T10:00:00Z",
  },
];

let state;
function setup(meBody, { summary = { pending_registrations: 2, open_requests: 3 } } = {}) {
  state = {
    me: meBody,
    summary,
    announcements: [{ title: "Welcome", body: "Read me" }],
  };
}

function respond(url, init = {}) {
  if (url.startsWith("/api/auth/me")) return state.me;
  if (url.startsWith("/api/announcements")) {
    if (init.method === "POST") {
      const body = JSON.parse(init.body);
      state.announcements = [...state.announcements, body];
      return body;
    }
    return state.announcements;
  }
  if (url.startsWith("/api/dashboard/summary")) return state.summary;
  if (url.startsWith("/api/dashboard/recent")) return RECENT;
  if (url.startsWith("/api/system/logs")) return LOGS;
  if (url.startsWith("/api/anime/"))
    return [
      {
        system_id: "a1",
        anime_name_en: "Frieren",
        airing_status: "Airing",
        broadcast_day: "Friday",
        watching_status: "Active Watching",
      },
    ];
  return [];
}

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let fetchMock;
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  fetchMock = vi.fn((url, init) =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(respond(String(url), init)),
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter>
            <Index />
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function fetchedUrls() {
  return fetchMock.mock.calls.map(([url]) => String(url));
}
function fetched(prefix) {
  return fetchedUrls().some((url) => url.startsWith(prefix));
}

// The catalogue dashboard is drawn once the anime list has filled the
// broadcast schedule.
async function catalogueLoaded() {
  await waitFor(() => expect(screen.getByText(/^\d+\s+scheduled$/)).toBeInTheDocument());
  await waitFor(() => expect(screen.getByText("Welcome")).toBeInTheDocument());
}

describe("the summary of what waits", () => {
  it("is not shown to, or fetched for, a user without manage.requests", async () => {
    setup(me("user", USER_PERMS));
    mount();
    await waitFor(() => expect(screen.getByText("My watch schedule")).toBeInTheDocument());
    await catalogueLoaded();
    expect(screen.queryByTestId("dashboard-summary")).toBeNull();
    expect(fetched("/api/dashboard/summary")).toBe(false);
  });

  it("is shown to super, each count linking to where it is handled", async () => {
    setup(me("super", SUPER_PERMS));
    mount();
    const summary = await screen.findByTestId("dashboard-summary");
    const inbox = within(summary).getByRole("link", { name: /3 open requests and reports/ });
    expect(inbox).toHaveAttribute("href", "/request-inbox");
    // Super cannot approve a registration: it is told who does, and is not
    // sent to a page that would not show the panel.
    expect(within(summary).getByText(/2 registrations waiting for the admin/)).toBeInTheDocument();
    expect(within(summary).queryByRole("link", { name: /registrations/ })).toBeNull();
    // Still the member dashboard.
    expect(screen.getByText("My watch schedule")).toBeInTheDocument();
  });

  it("is hidden entirely for super when both counts are zero", async () => {
    setup(me("super", SUPER_PERMS), { summary: { pending_registrations: 0, open_requests: 0 } });
    mount();
    await catalogueLoaded();
    await waitFor(() => expect(fetched("/api/dashboard/summary")).toBe(true));
    // Let the summary answer before asserting it drew nothing.
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId("dashboard-summary")).toBeNull();
    expect(screen.queryByText(/open request/)).toBeNull();
  });

  it("is shown for super when one count is above zero", async () => {
    setup(me("super", SUPER_PERMS), { summary: { pending_registrations: 0, open_requests: 1 } });
    mount();
    const summary = await screen.findByTestId("dashboard-summary");
    expect(within(summary).getByRole("link", { name: "1 open request or report" })).toBeInTheDocument();
    expect(within(summary).queryByText(/registration/)).toBeNull();
  });
});

describe("the library links", () => {
  function expectedLinks(permissions) {
    const held = new Set(permissions);
    return visibleSections(NAV_SECTIONS, (p) => held.has(p))
      .filter((s) => s.key === "library" || s.key === "restricted")
      .flatMap(sectionItems)
      .filter((item) => !item.divider)
      .map((item) => item.to);
  }

  it("equal the nav's Library and Restricted rows for a guest", async () => {
    setup(me("guest", GUEST_PERMS));
    mount();
    const links = await screen.findByTestId("library-links");
    const expected = expectedLinks(GUEST_PERMS);
    expect(expected.length).toBeGreaterThan(0);
    const drawn = within(links)
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(drawn).toEqual(expected);
    // The entity rows ask view.* keys a guest lacks, so they are absent
    // here - and present for a viewer that holds them (below).
    expect(drawn).not.toContain("/library/studio");
  });

  it("follow the viewer's permissions, as the nav does", async () => {
    const perms = [...GUEST_PERMS, "view.studio"];
    setup(me("guest", perms));
    mount();
    const links = await screen.findByTestId("library-links");
    const drawn = within(links)
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(drawn).toEqual(expectedLinks(perms));
    expect(drawn).toContain("/library/studio");
  });

  it("are not drawn for a member, who has its tracker", async () => {
    setup(me("user", USER_PERMS));
    mount();
    await waitFor(() => expect(screen.getByText("My watch schedule")).toBeInTheDocument());
    expect(screen.queryByTestId("library-links")).toBeNull();
    expect(document.getElementById("libraries")).toBeNull();
  });
});

describe("recently added", () => {
  it("is not shown to, or fetched for, a guest", async () => {
    setup(me("guest", GUEST_PERMS));
    mount();
    await screen.findByTestId("library-links");
    await catalogueLoaded();
    expect(document.getElementById("recent")).toBeNull();
    expect(fetched("/api/dashboard/recent")).toBe(false);
    const toc = within(screen.getByRole("navigation", { name: "Contents" }));
    expect(toc.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Announcements",
      "Schedule",
      "Broadcast",
      "Libraries",
    ]);
  });

  it("is shown to a shared account, beside the guest's dashboard", async () => {
    setup(me("shared", SHARED_PERMS));
    mount();
    const recent = await screen.findByTestId("recently-added");
    const link = within(recent).getByRole("link", { name: /Dungeon Meshi/ });
    expect(link.getAttribute("href")).toMatch(/^\/anime\/7(\/|$)/);
    expect(screen.getByTestId("library-links")).toBeInTheDocument();
    expect(screen.queryByText("My watch schedule")).toBeNull();
    const toc = within(screen.getByRole("navigation", { name: "Contents" }));
    expect(toc.getByRole("button", { name: "Recently added" })).toBeInTheDocument();
  });

  it("is not shown to a user, whose dashboard is its tracker", async () => {
    setup(me("user", USER_PERMS));
    mount();
    await waitFor(() => expect(screen.getByText("My watch schedule")).toBeInTheDocument());
    expect(document.getElementById("recent")).toBeNull();
    expect(fetched("/api/dashboard/recent")).toBe(false);
  });
});

describe("the admin's own page", () => {
  // Everything the admin's page may ask. A catalogue read would be a 401.
  const ADMIN_READS = [
    "/api/auth/me",
    "/api/announcements/",
    "/api/dashboard/summary",
    "/api/system/logs",
  ];

  it("renders instead of the catalogue dashboard and fetches no catalogue", async () => {
    setup(me("admin", ADMIN_PERMS));
    mount();
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    const runs = await screen.findByTestId("pipeline-runs");
    expect(within(runs).getByText("Backup")).toBeInTheDocument();
    expect(within(runs).getByText("Success")).toBeInTheDocument();
    const summary = await screen.findByTestId("dashboard-summary");
    expect(within(summary).getByRole("link", { name: /2 registrations to approve/ })).toHaveAttribute(
      "href",
      "/system",
    );
    expect(screen.getByTestId("announcement-editor")).toBeInTheDocument();

    expect(screen.queryByText("Broadcast schedule")).toBeNull();
    const urls = fetchedUrls();
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(
        ADMIN_READS.some((allowed) => url.startsWith(allowed)),
        url,
      ).toBe(true);
    }
    expect(fetched("/api/anime/")).toBe(false);
  });

  it("is not given to a viewer that also reads the catalogue", async () => {
    // admin.authz together with a media_type.* key: the catalogue dashboard.
    setup(me("admin", [...ADMIN_PERMS, "media_type.anime"]));
    mount();
    await catalogueLoaded();
    expect(screen.queryByRole("heading", { name: "Overview" })).toBeNull();
    expect(fetched("/api/anime/")).toBe(true);
  });

  it("is not given to super", async () => {
    setup(me("super", SUPER_PERMS));
    mount();
    await waitFor(() => expect(screen.getByText("My watch schedule")).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "Overview" })).toBeNull();
    expect(fetched("/api/system/logs")).toBe(false);
  });

  it("shows the announcements read-only without manage.announcements", async () => {
    setup(me("admin", ADMIN_PERMS.filter((p) => p !== "manage.announcements")));
    mount();
    await screen.findByRole("heading", { name: "Overview" });
    await waitFor(() => expect(screen.getByText("Welcome")).toBeInTheDocument());
    expect(screen.queryByTestId("announcement-editor")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add announcement" })).toBeNull();
  });

  it("adds an announcement with manage.announcements", async () => {
    const user = userEvent.setup();
    setup(me("admin", ADMIN_PERMS));
    mount();
    const editor = await screen.findByTestId("announcement-editor");
    await user.type(within(editor).getByPlaceholderText("Title"), "Maintenance");
    await user.type(within(editor).getByPlaceholderText(/Write the announcement/), "Down at noon");
    await user.click(within(editor).getByRole("button", { name: "Add announcement" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) => String(url) === "/api/announcements/" && init?.method === "POST",
        ),
      ).toBe(true),
    );
    // The board refetches and shows it.
    expect(await screen.findAllByText("Maintenance")).not.toHaveLength(0);
  });
});
