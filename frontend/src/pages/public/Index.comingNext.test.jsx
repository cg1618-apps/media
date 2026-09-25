// Dashboard Coming Next: under the broadcast schedule, collapsed by default,
// drawn only for a signed-in member, and holding next season's Watch When
// Airs and Planned To entries grouped by media type.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { AuthProvider } from "../../contexts/AuthContext";
import { ToastProvider } from "../../hooks/useToast";
import Index from "./Index";

const MEMBER = { is_admin: false, username: "reader", role: "member", is_root: false, permissions: ["self.list"] };
const GUEST = { is_admin: false, username: null, role: "guest", is_root: false, permissions: [] };

function respond(url, me) {
  if (url.startsWith("/api/auth/me")) return me;
  // Current season SUM 2026, so Coming Next is FAL 2026.
  if (url.startsWith("/api/seasonal/current-season")) return { current_season: "SUM 2026" };
  if (url.startsWith("/api/anime/"))
    return [
      { system_id: "a1", anime_name_en: "Frieren", franchise_id: "f1", watching_status: "Active Watching" },
      { system_id: "a2", anime_name_en: "Dandadan S3", release_season: "FAL", release_date: "2026-10-02", watching_status: "Watch When Airs" },
      { system_id: "a3", anime_name_en: "Last Season Show", release_season: "SUM", release_date: "2026-07-02", watching_status: "Watch When Airs" },
    ];
  if (url.startsWith("/api/movies/"))
    return [{ system_id: "m1", movie_name_en: "Dune Messiah", release_date_tw: "2026-12-18", watching_status: "Plan to Watch" }];
  if (url.startsWith("/api/game/"))
    return [{ system_id: "g1", game_name_en: "Hollow Knight Silksong", release_date: "2026-11", playing_status: "Play When Released" }];
  return [];
}

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function stub(me) {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.stubGlobal(
    "fetch",
    vi.fn((url) =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(respond(String(url), me)) }),
    ),
  );
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

async function loaded() {
  await waitFor(() => expect(screen.getByText("Frieren")).toBeInTheDocument());
}

it("is not drawn for a guest, who has no statuses of their own", async () => {
  stub(GUEST);
  mount();
  await loaded();
  expect(document.getElementById("schedule-coming")).toBeNull();
});

it("sits under the broadcast schedule and starts collapsed", async () => {
  stub(MEMBER);
  mount();
  await loaded();
  const coming = await waitFor(() => {
    const el = document.getElementById("schedule-coming");
    expect(el).not.toBeNull();
    return el;
  });
  const broadcast = document.getElementById("schedule-broadcast");
  expect(broadcast.compareDocumentPosition(coming) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(coming).getByRole("button", { name: "Expand" })).toHaveAttribute("aria-expanded", "false");
  expect(within(coming).queryByText("Dandadan S3")).not.toBeInTheDocument();
});

it("opens onto next season's entries, grouped by type under each sub-section", async () => {
  const user = userEvent.setup();
  stub(MEMBER);
  mount();
  await loaded();
  const coming = await waitFor(() => {
    const el = document.getElementById("schedule-coming");
    expect(el).not.toBeNull();
    return el;
  });
  await waitFor(() => expect(within(coming).getByText(/FAL 2026/)).toBeInTheDocument());
  // Wait for the extra movie list before opening, so every group is present.
  await waitFor(() => expect(within(coming).getByText("3")).toBeInTheDocument());
  await user.click(within(coming).getByRole("button", { name: "Expand" }));

  const airs = within(coming).getByRole("heading", { name: "Watch when airs" }).parentElement.parentElement;
  expect(within(airs).getByRole("heading", { name: "Anime" })).toBeInTheDocument();
  expect(within(airs).getByText("Dandadan S3")).toBeInTheDocument();
  expect(within(airs).getByRole("heading", { name: "Game" })).toBeInTheDocument();
  expect(within(airs).getByText("Hollow Knight Silksong")).toBeInTheDocument();
  // Last season is not "coming next".
  expect(within(coming).queryByText("Last Season Show")).not.toBeInTheDocument();

  const planned = within(coming).getByRole("heading", { name: "Planned to" }).parentElement.parentElement;
  expect(within(planned).getByRole("heading", { name: "Movie" })).toBeInTheDocument();
  expect(within(planned).getByText("Dune Messiah")).toBeInTheDocument();
  expect(within(planned).queryByText("Dandadan S3")).not.toBeInTheDocument();
});
