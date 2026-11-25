// Frontend: the collection hub's rating and expectation.
//
// Both are the viewer's own: a holder of self.list sees and edits them, saved
// through PUT /api/me/ratings; a member holding every view.* key but not
// self.list, on the same collection, gets neither the editor nor the values.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CollectionPage from "./CollectionPage";
import { ToastProvider } from "../../hooks/useToast";

let auth;
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../../components/relations/RelationGraph", () => ({ default: () => null }));

const COLLECTION = {
  system_id: "CL001",
  collection_name_en: "Type-Moon",
  my_rating: "S",
  collection_expectation: "High",
};

// Three members whose title, rating and expectation orders all differ, so
// each sort is told apart from the others.
const MEMBERS = [
  { system_id: "F1", public_id: 11, franchise_name_en: "Alpha", my_rating: "C", franchise_expectation: "Medium" },
  { system_id: "F2", public_id: 12, franchise_name_en: "Bravo", my_rating: "A+", franchise_expectation: "Low" },
  { system_id: "F3", public_id: 13, franchise_name_en: "Charlie", my_rating: "A", franchise_expectation: "Highest" },
];

function jsonRes(body) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
}

const putCalls = () => fetch.mock.calls.filter(([, init]) => init?.method === "PUT");
const ratingSelect = () =>
  screen.queryByRole("option", { name: "Not rated" })?.closest("select");

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url, init = {}) => {
      const u = String(url);
      if (init.method === "PUT" && u.startsWith("/api/me/ratings/")) {
        const body = JSON.parse(init.body);
        return jsonRes({
          owner_type: "collection",
          owner_id: "CL001",
          my_rating: "my_rating" in body ? body.my_rating : COLLECTION.my_rating,
          expectation:
            "expectation" in body ? body.expectation : COLLECTION.collection_expectation,
        });
      }
      if (u.startsWith("/api/collection/")) return jsonRes(COLLECTION);
      if (u.startsWith("/api/franchise/")) return jsonRes(MEMBERS);
      return jsonRes([]);
    }),
  );
});

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/collection/1"]}>
          <Routes>
            <Route path="/collection/:publicId/:slug?" element={<CollectionPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const VIEW_KEYS = ["view.studio", "view.publisher", "view.person", "view.character", "view.search", "view.random_picker"];

describe("CollectionPage own rating and expectation", () => {
  it("lets a holder of self.list save its own rating", async () => {
    const held = [...VIEW_KEYS, "self.list"];
    auth = { isAdmin: false, has: (p) => held.includes(p) };
    renderPage();
    expect(
      await screen.findByRole("heading", { level: 1, name: "Type-Moon" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Rating S")).toBeInTheDocument();

    await userEvent.selectOptions(ratingSelect(), "");
    await waitFor(() => expect(putCalls()).toHaveLength(1));
    expect(putCalls()[0][0]).toBe("/api/me/ratings/collection/CL001");
    expect(JSON.parse(putCalls()[0][1].body)).toEqual({ my_rating: null });
    await waitFor(() => expect(screen.queryByLabelText("Rating S")).toBeNull());
  });

  it("offers no editor, and draws neither value, without self.list", async () => {
    auth = { isAdmin: false, has: (p) => VIEW_KEYS.includes(p) };
    renderPage();
    expect(
      await screen.findByRole("heading", { level: 1, name: "Type-Moon" }),
    ).toBeInTheDocument();
    expect(ratingSelect()).toBeFalsy();
    expect(screen.queryByLabelText("Rating S")).toBeNull();
    expect(screen.queryByText("High")).toBeNull();
  });
});

const VIEWER = [...VIEW_KEYS, "self.list"];
const memberOrder = () =>
  screen
    .getAllByRole("heading", { level: 3 })
    .map((h) => h.textContent)
    .filter((t) => MEMBERS.some((m) => m.franchise_name_en === t));
const sortSelect = () => screen.getByRole("combobox", { name: "Sort" });

describe("CollectionPage header", () => {
  it("reads just 'Collection' above the title, with no franchise count or expectation chip", async () => {
    auth = { isAdmin: false, has: (p) => VIEWER.includes(p) };
    renderPage();
    await screen.findByRole("heading", { level: 1, name: "Type-Moon" });
    const header = screen.getByRole("banner");
    expect(header.textContent).not.toMatch(/franchise/i);
    expect(header.textContent).not.toMatch(/Expectation/);
    expect(screen.getAllByText("Collection").length).toBeGreaterThan(0);
    expect(header.textContent.startsWith("Collection")).toBe(true);
    expect(header.textContent.startsWith("Collection  ·")).toBe(false);
  });
});

describe("CollectionPage member sort", () => {
  it("sorts by title by default, and by my rating or expectation on request", async () => {
    auth = { isAdmin: false, has: (p) => VIEWER.includes(p) };
    renderPage();
    await screen.findByText("Charlie");
    expect(sortSelect().value).toBe("title");
    expect(memberOrder()).toEqual(["Alpha", "Bravo", "Charlie"]);

    await userEvent.selectOptions(sortSelect(), "my_rating");
    expect(memberOrder()).toEqual(["Bravo", "Charlie", "Alpha"]);

    await userEvent.selectOptions(sortSelect(), "expectation");
    expect(memberOrder()).toEqual(["Charlie", "Alpha", "Bravo"]);

    // The direction button runs the chosen sort backwards.
    await userEvent.click(screen.getByRole("button", { name: "Reverse order" }));
    expect(memberOrder()).toEqual(["Bravo", "Alpha", "Charlie"]);
  });

  it("offers only the title sort to a viewer without own data", async () => {
    auth = { isAdmin: false, has: (p) => VIEW_KEYS.includes(p) };
    renderPage();
    await screen.findByText("Charlie");
    const options = [...sortSelect().options].map((o) => o.value);
    expect(options).toEqual(["title"]);
    expect(memberOrder()).toEqual(["Alpha", "Bravo", "Charlie"]);
  });
});
