// The Picker Defaults editor: opens on what is saved, saves a sparse map.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { AuthProvider } from "../../contexts/AuthContext";
import { ToastProvider } from "../../hooks/useToast";
import PickerDefaults from "./PickerDefaults";

let storedDefaults = {};

function respond(url, init) {
  if (url.startsWith("/api/auth/me")) {
    return {
      is_admin: true,
      username: "admin",
      role: "admin",
      is_root: true,
      permissions: [],
      visible_gated_types: [],
    };
  }
  if (url.startsWith("/api/random-picker-defaults/")) {
    const mode = url.split("/").pop();
    if (init?.method === "PUT") return { message: "saved", mode };
    return { mode, version: 1, filters: storedDefaults[mode] ?? {} };
  }
  if (url.startsWith("/api/anime/"))
    return [
      { system_id: "a1", anime_name_en: "Frieren", airing_type: "TV" },
      { system_id: "a2", anime_name_en: "Mushishi Special", airing_type: "Special" },
    ];
  return [];
}

beforeEach(() => {
  storedDefaults = {};
  vi.stubGlobal(
    "fetch",
    vi.fn((url, init) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(respond(String(url), init)),
      }),
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
            <PickerDefaults />
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const puts = () => fetch.mock.calls.filter(([, init]) => init?.method === "PUT");

it("opens a mode on its saved defaults", async () => {
  storedDefaults = { anime: { airingType: ["Special"] } };
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Anime" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Special" })).toHaveAttribute("aria-pressed", "true"),
  );
  expect(screen.getByText(/1 matching now/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
});

it("saves only the chips that are on", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Anime" }));
  fireEvent.click(await screen.findByRole("button", { name: "TV" }));
  expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(puts()).toHaveLength(1));
  const [url, init] = puts()[0];
  expect(String(url)).toBe("/api/random-picker-defaults/anime");
  expect(JSON.parse(init.body)).toEqual({ version: 1, filters: { airingType: ["TV"] } });
  await waitFor(() => expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument());
});
