// Comic detail page - the browser tab title and the table of contents,
// as Anime.contents.test.jsx pins them for the anime page.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../../contexts/AuthContext";
import { PageTitleProvider } from "../../contexts/PageTitleContext";
import { ToastProvider } from "../../hooks/useToast";
import Comic from "./Comic";

const ENTRY = {
  system_id: "e1",
  public_id: 1,
  franchise_id: null,
  series_id: null,
  cover_image_file: null,
  sources: [],
  content_labels: [],
  credit_refs: {},
  comic_name_cn: "測試漫畫",
  comic_name_en: "Test Comic",
  comic_name_alt: null,
  reading_status: "Active Reading",
  issue_fin: 3,
  issue_total: 12,
  events: "Event A, Event B",
  writer: "A Writer",
  genre_main: "Superhero",
};

const ok = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

// A member with a list of their own (self.list), so the tracker is drawn.
function mockFetch(entry = ENTRY) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => {
      const u = String(url);
      if (u.startsWith("/api/comic/")) return ok(entry);
      if (u.startsWith("/api/auth/me")) {
        return ok({
          username: "reader",
          role: "user",
          permissions: ["view.character", "self.list"],
        });
      }
      return ok([]);
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={["/comic/1"]}>
            <PageTitleProvider>
              <Routes>
                <Route path="/comic/:publicId/:slug?" element={<Comic />} />
              </Routes>
            </PageTitleProvider>
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const rows = () =>
  within(screen.getByRole("navigation", { name: "Contents" }))
    .getAllByRole("button")
    .map((b) => b.textContent);

describe("Comic detail page - tab title and contents", () => {
  it("titles the tab with the entry's displayed title, the one the heading shows", async () => {
    mockFetch();
    mount();
    await screen.findByRole("heading", { level: 1, name: "Test Comic" });
    await waitFor(() => expect(document.title).toBe("Test Comic"));
  });

  // Information, Events, Genres - and no Production card, though the entry
  // has a writer credited.
  it("lists the main-column sections in page order", async () => {
    mockFetch();
    mount();
    await waitFor(() =>
      expect(rows()).toEqual(["My tracker", "Naming", "Information", "Events", "Genres"]),
    );
    expect(screen.queryByRole("heading", { level: 3, name: "Production" })).toBeNull();
  });
});

// Publisher, Type, Continuity and Era; then Serialization Status, Release Year, Volume
// Label and Issue Total. The genres are on the Genres card and the reading
// status on the tracker, so neither is here.
it("lays the Information card out in two rows", async () => {
  mockFetch({
    ...ENTRY,
    comic_type: "Ongoing",
    continuity: "Earth-616",
    era: "Modern",
    serialization_status: "連載中",
    release_date: "2020",
    volume_label: "Vol. 3",
    publisher: "Marvel",
  });
  mount();
  const heading = await screen.findByRole("heading", { level: 3, name: "Information" });
  const c = within(heading.closest("section"));
  const LABELS = [
    "出版商", "Type", "Continuity", "Era", "Serialization Status", "Release Year", "Volume Label", "Issue Total",
  ];
  const rowOf = (label) => c.getByText(label).closest(".grid");
  const labelsIn = (row) => LABELS.filter((l) => row.contains(c.getByText(l)));
  expect(labelsIn(rowOf("Type"))).toEqual(["出版商", "Type", "Continuity", "Era"]);
  expect(c.getByText("Marvel")).toBeInTheDocument();
  expect(labelsIn(rowOf("Serialization Status"))).toEqual([
    "Serialization Status", "Release Year", "Volume Label", "Issue Total",
  ]);
  for (const gone of ["Genre (Main)", "Reading Status", "Label"]) {
    expect(c.queryByText(gone)).toBeNull();
  }
});
