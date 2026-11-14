// The dashboard's progress steppers write the viewer's own row, so they follow
// self.list (not manage.catalog) and go to PUT /api/me/list, not the catalogue
// PATCH. The member here holds self.list and no catalogue edit; the mirror is
// a session with the same entries and no list, which is offered no stepper.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { AuthProvider } from "../../contexts/AuthContext";
import { ToastProvider } from "../../hooks/useToast";
import Index from "./Index";

let permissions = ["self.list"];

function respond(url) {
  if (url.startsWith("/api/auth/me")) {
    return { is_admin: false, username: "reader", role: "user", permissions };
  }
  if (url.startsWith("/api/me/list/a1")) {
    return { media_id: "a1", media_type: "anime", watching_status: "Active Watching", ep_fin: 4 };
  }
  if (url.startsWith("/api/anime/"))
    return [
      {
        system_id: "a1",
        anime_name_en: "Frieren",
        franchise_id: "f1",
        watching_status: "Active Watching",
        ep_fin: 3,
        ep_total: 28,
      },
    ];
  return [];
}

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  permissions = ["self.list"];
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.stubGlobal(
    "fetch",
    vi.fn((url) =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(respond(String(url))) }),
    ),
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

it("steps a member's own progress through /api/me/list", async () => {
  mount();
  const back = await screen.findByRole("button", { name: "One back" });
  await userEvent.click(back);
  await waitFor(() =>
    expect(fetch.mock.calls.some(([url]) => String(url) === "/api/me/list/a1")).toBe(true),
  );
  const [, options] = fetch.mock.calls.find(([url]) => String(url) === "/api/me/list/a1");
  expect(options.method).toBe("PUT");
  expect(JSON.parse(options.body)).toEqual({ ep_fin: 2 });
  expect(fetch.mock.calls.some(([, o]) => o?.method === "PATCH")).toBe(false);
});

it("offers no stepper without a list", async () => {
  // The guest's dashboard: no tracker division, so nothing to step.
  permissions = [];
  mount();
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  await waitFor(() => expect(screen.queryByText("Loading dashboard...")).toBeNull());
  expect(screen.queryByRole("button", { name: "One back" })).toBeNull();
});
