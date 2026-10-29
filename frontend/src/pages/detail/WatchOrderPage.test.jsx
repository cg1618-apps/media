// Frontend: tests for the full watch order page's way into the editor.
//
// "Edit this order" opens /watch-orders on this order (?order=<system_id>),
// scoped to its owner (?owner=<tier>:<system_id>), not on the page's start.
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import WatchOrderPage from "./WatchOrderPage";

let isAdmin = true;

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ isAdmin, has: () => false }),
}));

vi.mock("../../components/tracker/FollowOrderButton", () => ({
  default: () => null,
}));

vi.mock("../../hooks/useCanonicalPath", () => ({
  useCanonicalPath: () => {},
}));

const ORDER = {
  system_id: "L1",
  public_id: 7,
  list_name: "Main order",
  franchise_id: "FR001",
  media_types: [],
  items: [],
};

function jsonRes(body) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

beforeEach(() => {
  isAdmin = true;
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => {
      const u = String(url);
      if (u.startsWith("/api/watch-order/lists?")) return jsonRes([ORDER]);
      if (u.startsWith("/api/franchise/")) {
        return jsonRes({ system_id: "FR001", franchise_name_en: "Elden Ring" });
      }
      return jsonRes(ORDER);
    }),
  );
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/watch-order/7"]}>
      <Routes>
        <Route path="/watch-order/:publicId/:slug?" element={<WatchOrderPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("WatchOrderPage edit link", () => {
  it("opens this order in the editor, scoped to its owner", async () => {
    renderPage();
    const link = await screen.findByRole("link", { name: "Edit this order" });
    expect(
      Object.fromEntries(new URL(link.getAttribute("href"), "http://x").searchParams),
    ).toEqual({ owner: "franchise:FR001", order: "L1" });
  });

  it("draws no link for a guest", async () => {
    isAdmin = false;
    renderPage();
    await screen.findByText("Main order");
    expect(screen.queryByRole("link", { name: "Edit this order" })).toBeNull();
  });
});
