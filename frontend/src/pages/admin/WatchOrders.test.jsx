// Frontend: tests for the Watch Orders page's state in the URL.
//
// The scoped owner is ?owner=<tier>:<id> and the open order is
// ?order=<system_id>, so a hub's "Edit" or the full page's "Edit this order"
// opens that order in the editor. The editor is stubbed: what is under test is
// which order the page hands it, and what it writes back to the URL.
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import WatchOrders from "./WatchOrders";

// One showToast for the whole file, as the real hook gives: the page's loaders
// depend on it, and a new one per render refetches forever.
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock("../../hooks/useToast", () => ({
  useToast: () => toast,
}));

vi.mock("../../components/tracker/WatchOrderEditor", () => ({
  default: ({ listId }) => <p data-testid="editor">{listId ?? "none"}</p>,
  LIST_TYPES: ["Custom"],
}));

const LISTS = [
  { system_id: "L1", list_name: "Main order", franchise_id: "FR001", media_types: [] },
  { system_id: "L2", list_name: "Side order", franchise_id: "FR001", media_types: [] },
];
const FRANCHISES = [{ system_id: "FR001", franchise_name_en: "Elden Ring" }];

function jsonRes(body) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => {
      const u = String(url);
      if (u.startsWith("/api/watch-order/lists")) return jsonRes(LISTS);
      if (u.startsWith("/api/franchise")) return jsonRes(FRANCHISES);
      return jsonRes([]);
    }),
  );
});

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="search">{location.search}</p>;
}

function renderAt(path) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/watch-orders"
          element={
            <>
              <WatchOrders />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const params = () =>
  Object.fromEntries(new URLSearchParams(screen.getByTestId("search").textContent));

describe("WatchOrders open order in the URL", () => {
  it("opens the order the order parameter names", async () => {
    renderAt("/watch-orders?owner=franchise:FR001&order=L2");

    expect(await screen.findByText("Elden Ring")).toBeInTheDocument();
    expect(screen.getByTestId("editor").textContent).toBe("L2");
  });

  it("writes a picked order to the order parameter, keeping the owner", async () => {
    renderAt("/watch-orders?owner=franchise:FR001");
    expect(screen.getByTestId("editor").textContent).toBe("none");

    fireEvent.click(await screen.findByText("Side order"));

    expect(screen.getByTestId("editor").textContent).toBe("L2");
    expect(params()).toEqual({ owner: "franchise:FR001", order: "L2" });
  });

  it("writes both owner and order when opening a search hit", async () => {
    // One write, not two: setSearchParams reads the params of the render it
    // came from, so a second call in the same tick would drop the first.
    renderAt("/watch-orders");
    fireEvent.change(await screen.findByPlaceholderText("Search owners and orders…"), {
      target: { value: "Side" },
    });

    fireEvent.click(await screen.findByText("Side order"));

    expect(screen.getByTestId("editor").textContent).toBe("L2");
    expect(params()).toEqual({ owner: "franchise:FR001", order: "L2" });
  });
});
