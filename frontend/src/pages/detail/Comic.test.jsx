// Frontend: the comic detail page's Autofill & update, the single-entry
// Replace every media page carries - for a comic, one Comic Vine fetch,
// blank columns only.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../../contexts/AuthContext";
import { ToastProvider } from "../../hooks/useToast";
import Comic from "./Comic";

describe("Comic detail page — Replace", () => {
  const COMIC = {
    system_id: "k1",
    comic_name_en: "Test Comic",
    franchise_id: null,
    series_id: null,
    cover_image_file: null,
    sources: [],
    content_labels: [],
    credit_refs: {},
  };

  function mockFetch({ isAdmin }) {
    const calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url, init) => {
        const u = String(url);
        calls.push({ url: u, method: init?.method || "GET" });
        let body = [];
        if (u.startsWith("/api/auth/me")) {
          body = {
            is_admin: isAdmin,
            username: isAdmin ? "cg1618" : null,
            role: isAdmin ? "super" : "guest",
            permissions: isAdmin ? ["manage.catalog", "manage.pipelines"] : [],
          };
        } else if (u.startsWith("/api/comic/k1")) {
          body = COMIC;
        } else if (u.startsWith("/api/data-control/replace/")) {
          body = { status: "success", message: "done" };
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
      }),
    );
    return calls;
  }

  afterEach(() => vi.unstubAllGlobals());

  function mount() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={["/comic/k1"]}>
              <Routes>
                <Route path="/comic/:publicId/:slug?" element={<Comic />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>,
    );
  }

  it("posts the single-entry Replace for this comic", async () => {
    const calls = mockFetch({ isAdmin: true });
    mount();

    fireEvent.click(await screen.findByRole("button", { name: "Autofill & update" }));

    await waitFor(() =>
      expect(calls).toContainEqual({
        url: "/api/data-control/replace/comic/k1",
        method: "POST",
      }),
    );
  });

  // Mirror case: the same page, a guest, and no toolbar - so the admin test
  // above is finding the button because of isAdmin, not because it is always there.
  it("offers no Replace to a guest", async () => {
    mockFetch({ isAdmin: false });
    mount();

    await screen.findByRole("heading", { name: "Test Comic" });
    expect(screen.queryByRole("button", { name: "Autofill & update" })).not.toBeInTheDocument();
  });
});
