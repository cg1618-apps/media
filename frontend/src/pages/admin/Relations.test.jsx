// Frontend: tests for the Relations page's scope in the URL.
//
// The picked franchise, series or collection lives in ?owner=<tier>:<system_id>, so a
// hub's "Edit relations" link, a reload and a shared link all land on that
// scope. The canvas and the form are stubbed: what is under test is which
// scope the page hands them, and what it writes back to the URL.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Relations from "./Relations";

vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock("../../components/relations/RelationGraph", () => ({
  default: ({ scopeType, scopeId, onPickGhostFranchise }) => (
    <div>
      <p data-testid="graph-scope">{`${scopeType}:${scopeId ?? "none"}`}</p>
      <button type="button" onClick={() => onPickGhostFranchise("FR002")}>
        follow ghost
      </button>
    </div>
  ),
}));

vi.mock("../../components/relations/RelationForm", () => ({
  default: () => null,
}));

const FRANCHISES = [
  { system_id: "FR001", franchise_name_en: "Elden Ring" },
  { system_id: "FR002", franchise_name_en: "Dark Souls" },
];
const COLLECTIONS = [{ system_id: "CO001", collection_name_en: "FromSoftware" }];
const SERIES = [{ system_id: "SE001", series_name_en: "Souls Trilogy" }];

function jsonRes(body) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => {
      const u = String(url);
      if (u.startsWith("/api/franchise")) return jsonRes(FRANCHISES);
      if (u.startsWith("/api/collection")) return jsonRes(COLLECTIONS);
      if (u.startsWith("/api/series")) return jsonRes(SERIES);
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
          path="/relations"
          element={
            <>
              <Relations />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

function fetchedUrls() {
  return fetch.mock.calls.map(([url]) => String(url));
}

describe("Relations scope from the URL", () => {
  it("opens on the franchise the owner parameter names", async () => {
    renderAt("/relations?owner=franchise:FR001");

    expect(await screen.findByText("Elden Ring")).toBeInTheDocument();
    expect(screen.getByTestId("graph-scope").textContent).toBe("franchise:FR001");
    await waitFor(() =>
      expect(fetchedUrls()).toContain(
        "/api/order/candidates?franchise_id=FR001",
      ),
    );
  });

  it("opens on a collection, with the collection tier active", async () => {
    renderAt("/relations?owner=collection:CO001");

    expect(await screen.findByText("FromSoftware")).toBeInTheDocument();
    expect(screen.getByTestId("graph-scope").textContent).toBe("collection:CO001");
    await waitFor(() =>
      expect(fetchedUrls()).toContain(
        "/api/order/candidates?collection_id=CO001",
      ),
    );
  });

  it("opens on a series, scoping every request to that series", async () => {
    renderAt("/relations?owner=series:SE001");

    expect(await screen.findByText("Souls Trilogy")).toBeInTheDocument();
    expect(screen.getByTestId("graph-scope").textContent).toBe("series:SE001");
    await waitFor(() => {
      expect(fetchedUrls()).toContain("/api/order/candidates?series_id=SE001");
      expect(fetchedUrls()).toContain("/api/media-relation/?series_id=SE001");
    });
  });

  it("opens empty on an owner of a tier it cannot show", async () => {
    renderAt("/relations?owner=studio:ST001");

    expect(screen.getByText("Pick a franchise to begin.")).toBeInTheDocument();
    expect(screen.getByTestId("graph-scope").textContent).toBe("franchise:none");
  });
});

describe("Relations scope into the URL", () => {
  it("writes the followed ghost franchise to the owner parameter", async () => {
    renderAt("/relations?owner=franchise:FR001");
    await screen.findByText("Elden Ring");

    await userEvent.click(screen.getByRole("button", { name: "follow ghost" }));

    expect(screen.getByTestId("search").textContent).toBe(
      "?owner=franchise%3AFR002",
    );
    expect(await screen.findByText("Dark Souls")).toBeInTheDocument();
  });

  it("drops the owner parameter when the tier is switched", async () => {
    renderAt("/relations?owner=franchise:FR001");
    await screen.findByText("Elden Ring");

    await userEvent.click(screen.getByRole("button", { name: "Collection" }));

    expect(screen.getByTestId("search").textContent).toBe("");
    expect(screen.getByText("Pick a collection to begin.")).toBeInTheDocument();
  });

  it("offers series as a tier to pick from", async () => {
    renderAt("/relations");

    await userEvent.click(screen.getByRole("button", { name: "Series" }));

    expect(screen.getByText("Pick a series to begin.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search series…")).toBeInTheDocument();
  });

  it("drops the owner parameter when the pick is cleared", async () => {
    renderAt("/relations?owner=franchise:FR001");
    await screen.findByText("Elden Ring");

    await userEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(screen.getByTestId("search").textContent).toBe("");
    expect(screen.getByText("Pick a franchise to begin.")).toBeInTheDocument();
  });
});
