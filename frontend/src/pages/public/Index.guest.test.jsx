// Dashboard for a guest: Announcements and the Broadcast schedule, and
// nothing else. My watch schedule, the type filter and the Watching, Reading
// and Playing divisions are the viewer's own tracking, drawn only for a
// member (self.list), and the lists only they read are not fetched for a
// guest. Every guest case runs against data that WOULD fill the hidden parts
// - an airing anime with a watch day and an active status, a manga being
// read - and the member mirror asserts those parts appear with the same data,
// so a pass means the gate did the hiding.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { AuthProvider } from "../../contexts/AuthContext";
import { ToastProvider } from "../../hooks/useToast";
import Index from "./Index";

const MEMBER = { is_admin: false, username: "reader", role: "user", is_root: false, permissions: ["self.list"] };
const GUEST = { is_admin: false, username: null, role: "guest", is_root: false, permissions: [] };

function respond(url, me) {
  if (url.startsWith("/api/auth/me")) return me;
  if (url.startsWith("/api/announcements")) return [];
  if (url.startsWith("/api/anime/"))
    return [
      {
        system_id: "a1",
        anime_name_en: "Frieren",
        franchise_id: "f1",
        airing_status: "Airing",
        broadcast_day: "Friday",
        my_watch_day: "Saturday",
        watching_status: "Active Watching",
      },
    ];
  if (url.startsWith("/api/manga/"))
    return [{ system_id: "m1", manga_name_en: "Berserk", franchise_id: "f3", reading_status: "Active Reading" }];
  return [];
}

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let fetchMock;
function stub(me) {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  fetchMock = vi.fn((url) =>
    Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(respond(String(url), me)) }),
  );
  vi.stubGlobal("fetch", fetchMock);
}
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

function fetched(prefix) {
  return fetchMock.mock.calls.some(([url]) => String(url).startsWith(prefix));
}

// The anime list is loaded once the Broadcast schedule counts its entry.
async function loaded() {
  await waitFor(() => expect(screen.getByText("Broadcast schedule")).toBeInTheDocument());
  await waitFor(() => expect(fetched("/api/auth/me")).toBe(true));
}

describe("a guest's dashboard", () => {
  it("draws Announcements and the Broadcast schedule", async () => {
    stub(GUEST);
    mount();
    await loaded();
    expect(screen.getByText(/announcements & notes/i)).toBeInTheDocument();
    expect(screen.getByText("Broadcast schedule")).toBeInTheDocument();
    // Only the broadcast entry is counted: the watch-day one is personal.
    expect(screen.getByText(/^1\s+scheduled$/)).toBeInTheDocument();
  });

  it("draws no watch schedule, filter bar or tracker division", async () => {
    stub(GUEST);
    mount();
    await loaded();
    expect(screen.queryByText("My watch schedule")).toBeNull();
    expect(document.querySelector("[data-filter-bar]")).toBeNull();
    for (const id of ["schedule-watch", "watching", "reading", "playing"]) {
      expect(document.getElementById(id), id).toBeNull();
    }
    expect(screen.queryByText("Berserk")).toBeNull();
  });

  it("lists only the parts it draws in the contents sidebar", async () => {
    stub(GUEST);
    mount();
    await loaded();
    const toc = within(screen.getByRole("navigation", { name: "Contents" }));
    expect(toc.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Announcements",
      "Schedule",
      "Broadcast",
    ]);
  });

  it("fetches the anime list and none of the tracker lists", async () => {
    stub(GUEST);
    mount();
    await loaded();
    expect(fetched("/api/anime/")).toBe(true);
    for (const prefix of ["/api/franchise/", "/api/tv-shows/", "/api/manga/", "/api/game/"]) {
      expect(fetched(prefix), prefix).toBe(false);
    }
  });
});

describe("a member's dashboard, with the same data", () => {
  it("draws the watch schedule, the filter bar and the divisions", async () => {
    stub(MEMBER);
    mount();
    await waitFor(() => expect(screen.getByText("Berserk")).toBeInTheDocument());
    expect(screen.getByText("My watch schedule")).toBeInTheDocument();
    expect(document.querySelector("[data-filter-bar]")).not.toBeNull();
    expect(document.getElementById("watching")).not.toBeNull();
    expect(screen.getByText(/^2\s+scheduled$/)).toBeInTheDocument();
    const toc = within(screen.getByRole("navigation", { name: "Contents" }));
    expect(toc.getByRole("button", { name: "My Watch" })).toBeInTheDocument();
    expect(toc.getByRole("button", { name: "Watching" })).toBeInTheDocument();
    expect(fetched("/api/manga/")).toBe(true);
  });
});
