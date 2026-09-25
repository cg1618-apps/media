// Dashboard type filter: one single-select bar, pinned above the Watching,
// Reading and Playing divisions together with the view toggle. Picking a type
// shows only that type's entries and hides every division that cannot hold it.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { AuthProvider } from "../../contexts/AuthContext";
import { ToastProvider } from "../../hooks/useToast";
import Index from "./Index";

function respond(url) {
  if (url.startsWith("/api/auth/me")) {
    return { is_admin: false, username: null, role: "guest", is_root: false, permissions: [] };
  }
  if (url.startsWith("/api/anime/"))
    return [{ system_id: "a1", anime_name_en: "Frieren", franchise_id: "f1", watching_status: "Active Watching" }];
  if (url.startsWith("/api/tv-shows/"))
    return [{ system_id: "t1", tv_name_en: "Severance", franchise_id: "f2", watching_status: "Active Watching" }];
  if (url.startsWith("/api/manga/"))
    return [{ system_id: "m1", manga_name_en: "Berserk", franchise_id: "f3", reading_status: "Active Reading" }];
  if (url.startsWith("/api/comic/"))
    return [{ system_id: "c1", comic_name_en: "Saga", franchise_id: "f4", reading_status: "Active Reading" }];
  if (url.startsWith("/api/game/"))
    return [{ system_id: "g1", game_name_en: "Hades", franchise_id: "f5", playing_status: "Active Playing" }];
  if (url.startsWith("/api/franchise/")) return [];
  return [];
}

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(respond(String(url))) })),
  );
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

async function loaded() {
  await waitFor(() => expect(screen.getByText("Frieren")).toBeInTheDocument());
}

const DIVISIONS = ["watching", "reading", "playing"];

function bar() {
  return within(screen.getByTestId("dashboard-filter"));
}

function shownDivisions() {
  return DIVISIONS.filter((id) => document.getElementById(id));
}

it("renders one filter bar, above the Watching division", async () => {
  mount();
  await loaded();
  expect(screen.getAllByTestId("dashboard-filter")).toHaveLength(1);
  for (const label of ["All", "Anime", "TV Show", "Cartoon", "Manga", "Novel", "Comic", "Game", "Cards", "List"]) {
    expect(bar().getByRole("button", { name: label })).toBeInTheDocument();
  }
  const filterBar = screen.getByTestId("dashboard-filter");
  const watching = document.getElementById("watching");
  expect(filterBar.compareDocumentPosition(watching) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("the bar is sticky and the division titles are not", async () => {
  mount();
  await loaded();
  expect(screen.getByTestId("dashboard-filter").className).toMatch(/sticky/);
  for (const title of ["Watching", "Reading", "Playing"]) {
    const header = screen.getByRole("heading", { name: title }).parentElement.parentElement;
    expect(header.className).not.toMatch(/sticky/);
  }
  // The sub-section headers stay pinned.
  expect(
    screen.getByRole("heading", { name: "Active watching" }).parentElement.className,
  ).toMatch(/sticky/);
});

it("with no type picked every division is shown", async () => {
  mount();
  await loaded();
  expect(shownDivisions()).toEqual(DIVISIONS);
});

it("picking a type filters entries and hides divisions that cannot hold it", async () => {
  const user = userEvent.setup();
  mount();
  await loaded();

  await user.click(bar().getByRole("button", { name: "Anime" }));
  expect(screen.getByText("Frieren")).toBeInTheDocument();
  expect(screen.queryByText("Severance")).not.toBeInTheDocument();
  expect(shownDivisions()).toEqual(["watching"]);

  await user.click(bar().getByRole("button", { name: "Comic" }));
  expect(screen.getByText("Saga")).toBeInTheDocument();
  expect(screen.queryByText("Berserk")).not.toBeInTheDocument();
  expect(shownDivisions()).toEqual(["reading"]);

  await user.click(bar().getByRole("button", { name: "Game" }));
  expect(screen.getByText("Hades")).toBeInTheDocument();
  expect(screen.queryByText("Frieren")).not.toBeInTheDocument();
  expect(shownDivisions()).toEqual(["playing"]);
});

it("clicking the active type again, or All, restores every division", async () => {
  const user = userEvent.setup();
  mount();
  await loaded();
  await user.click(bar().getByRole("button", { name: "Game" }));
  await user.click(bar().getByRole("button", { name: "Game" }));
  expect(shownDivisions()).toEqual(DIVISIONS);

  await user.click(bar().getByRole("button", { name: "Manga" }));
  await user.click(bar().getByRole("button", { name: "All" }));
  expect(shownDivisions()).toEqual(DIVISIONS);
  expect(screen.getByText("Frieren")).toBeInTheDocument();
  expect(screen.getByText("Berserk")).toBeInTheDocument();
});

it("the contents sidebar drops the links of hidden divisions", async () => {
  const user = userEvent.setup();
  mount();
  await loaded();
  const toc = within(screen.getByRole("navigation", { name: "Contents" }));
  expect(toc.getByRole("button", { name: "Watching" })).toBeInTheDocument();
  await user.click(bar().getByRole("button", { name: "Game" }));
  expect(toc.queryByRole("button", { name: "Watching" })).not.toBeInTheDocument();
  expect(toc.queryByRole("button", { name: "Reading" })).not.toBeInTheDocument();
  expect(toc.getByRole("button", { name: "Playing" })).toBeInTheDocument();
  expect(toc.getByRole("button", { name: "Schedule" })).toBeInTheDocument();
});
