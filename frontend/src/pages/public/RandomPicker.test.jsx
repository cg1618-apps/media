// The picker page: its modes, the draw, and which lists it fetches.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { AuthProvider } from "../../contexts/AuthContext";
import { ToastProvider } from "../../hooks/useToast";
import RandomPicker from "./RandomPicker";

let visibleGatedTypes = [];
let storedDefaults = {};
let storedWeighted = {};
let username = null;

function respond(url) {
  if (url.startsWith("/api/auth/me")) {
    return {
      is_admin: false,
      username,
      role: "guest",
      is_root: false,
      permissions: [],
      visible_gated_types: visibleGatedTypes,
    };
  }
  if (url.startsWith("/api/anime/"))
    return [
      { system_id: "a1", anime_name_en: "Frieren", airing_type: "TV" },
      { system_id: "a2", anime_name_en: "Mushishi Special", airing_type: "Special" },
    ];
  if (url.startsWith("/api/random-picker-defaults/")) {
    const mode = url.split("/").pop();
    return {
      mode,
      version: 1,
      filters: storedDefaults[mode] ?? {},
      weighted: storedWeighted[mode] ?? true,
    };
  }
  if (url.startsWith("/api/manga/")) return [{ system_id: "m1", manga_name_en: "Yotsuba" }];
  return [];
}

beforeEach(() => {
  visibleGatedTypes = [];
  storedDefaults = {};
  storedWeighted = {};
  username = null;
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(respond(String(url))) }))
  );
});
afterEach(() => vi.unstubAllGlobals());

function mount(path) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/random" element={<RandomPicker />} />
              <Route path="/random/:type" element={<RandomPicker />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

const fetched = () => fetch.mock.calls.map(([url]) => String(url));

it("draws across types in the general mode, narrowed by media type", async () => {
  mount("/random");
  await waitFor(() => expect(screen.getByText("3 in the pool")).toBeInTheDocument());

  // The chip, not the mode link of the same name.
  fireEvent.click(screen.getByRole("button", { name: "Manga" }));
  expect(screen.getByText("1 in the pool")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /^pick$/i }));
  expect(await screen.findByText("Yotsuba")).toBeInTheDocument();
  expect(screen.queryByText("Frieren")).not.toBeInTheDocument();
});

it("offers a type's own library filters in its mode", async () => {
  mount("/random/anime");
  await waitFor(() => expect(screen.getByText("2 in the pool")).toBeInTheDocument());
  expect(screen.queryByText("Media Type")).not.toBeInTheDocument();
  expect(fetched().some((u) => u.startsWith("/api/manga/"))).toBe(false);

  fireEvent.click(screen.getByRole("button", { name: "Special" }));
  expect(screen.getByText("1 in the pool")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^pick$/i }));
  expect(await screen.findByText("Mushishi Special")).toBeInTheDocument();
});

it("empties the pool and disables the draw when nothing matches", async () => {
  mount("/random/anime");
  await waitFor(() => expect(screen.getByText("2 in the pool")).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "OVA" }));
  expect(screen.getByText("0 in the pool")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^pick$/i })).toBeDisabled();
});

// Both halves use the same page and mocks; only what /api/auth/me names
// differs, so the refusal is the gate's and not an empty mock.
it("fetches a gated type only for a session that may see it", async () => {
  mount("/random");
  await waitFor(() => expect(screen.getByText("3 in the pool")).toBeInTheDocument());
  expect(fetched().some((u) => u.startsWith("/api/hentai/"))).toBe(false);
  expect(screen.queryByRole("link", { name: "Hentai" })).not.toBeInTheDocument();
});

it("fetches and offers a gated type the session may see", async () => {
  visibleGatedTypes = ["hentai"];
  mount("/random");
  await waitFor(() => expect(fetched().some((u) => u.startsWith("/api/hentai/"))).toBe(true));
  expect(await screen.findByRole("link", { name: "Hentai" })).toBeInTheDocument();
});

it("sends an unknown type back to the general mode", async () => {
  mount("/random/hologram");
  await waitFor(() => expect(screen.getByText("3 in the pool")).toBeInTheDocument());
  expect(screen.getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "page");
});

it("clears every filter and the pick with Clear all", async () => {
  mount("/random/anime");
  await waitFor(() => expect(screen.getByText("2 in the pool")).toBeInTheDocument());
  const clear = screen.getByRole("button", { name: "Clear all" });
  expect(clear).toBeDisabled();

  fireEvent.click(screen.getByRole("button", { name: "Special" }));
  fireEvent.click(screen.getByRole("button", { name: /^pick$/i }));
  expect(await screen.findByText("Mushishi Special")).toBeInTheDocument();

  fireEvent.click(clear);
  expect(screen.getByText("2 in the pool")).toBeInTheDocument();
  expect(screen.queryByText("Mushishi Special")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Special" })).toHaveAttribute("aria-pressed", "false");
  expect(clear).toBeDisabled();
});

it("opens a mode on its saved defaults, and Defaults brings them back", async () => {
  storedDefaults = { anime: { airingType: ["Special"] } };
  mount("/random/anime");
  await waitFor(() => expect(screen.getByText("1 in the pool")).toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Special" })).toHaveAttribute("aria-pressed", "true");

  fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
  expect(screen.getByText("2 in the pool")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Defaults" }));
  expect(screen.getByText("1 in the pool")).toBeInTheDocument();
});

it("offers no Defaults button for a mode with none saved", async () => {
  mount("/random/anime");
  await waitFor(() => expect(screen.getByText("2 in the pool")).toBeInTheDocument());
  expect(screen.queryByRole("button", { name: "Defaults" })).not.toBeInTheDocument();
});

it("draws weighted by default, and says the chance the pick had", async () => {
  mount("/random/anime");
  await waitFor(() => expect(screen.getByText("2 in the pool")).toBeInTheDocument());
  expect(screen.getByRole("checkbox", { name: "Weighted" })).toBeChecked();

  fireEvent.click(screen.getByRole("button", { name: "Special" }));
  fireEvent.click(screen.getByRole("button", { name: /^pick$/i }));
  expect(await screen.findByText(/1 in 1 \(100\.0%\) chance/)).toBeInTheDocument();
});

it("opens a mode saved unweighted as unweighted, and Defaults brings that back", async () => {
  storedWeighted = { anime: false };
  mount("/random/anime");
  await waitFor(() => expect(screen.getByText("2 in the pool")).toBeInTheDocument());
  const weighted = screen.getByRole("checkbox", { name: "Weighted" });
  expect(weighted).not.toBeChecked();

  fireEvent.click(weighted);
  expect(weighted).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Defaults" }));
  expect(weighted).not.toBeChecked();
});

// Same page and mocks both times; only the session differs, so the guest's
// missing request is the page's choice and not a mock that never answers.
it("asks a guest for no plan marks, since a plan is private", async () => {
  mount("/random");
  await waitFor(() => expect(screen.getByText("3 in the pool")).toBeInTheDocument());
  expect(fetched().some((u) => u.startsWith("/api/plan-next"))).toBe(false);
});

it("asks a signed-in session for its plan marks", async () => {
  username = "reader";
  mount("/random");
  await waitFor(() =>
    expect(fetched().some((u) => u.startsWith("/api/plan-next"))).toBe(true),
  );
});

it("lists every weight on the Weights tab", async () => {
  mount("/random?tab=weights");
  expect(await screen.findByText("Step 1 · Status group")).toBeInTheDocument();
  expect(screen.getByText("Serialization · Manga mode only")).toBeInTheDocument();
  expect(screen.queryByText(/in the pool/)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Picker" }));
  await waitFor(() => expect(screen.getByText("3 in the pool")).toBeInTheDocument());
});
