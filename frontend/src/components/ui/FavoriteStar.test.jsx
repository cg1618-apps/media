// The favourite star: shown only with the `favourites` feature, and written
// through the caller's own endpoint, never the catalogue's PATCH.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import FavoriteStar from "./FavoriteStar";
import { ToastProvider } from "../../hooks/useToast";

let features = [];
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ hasFeature: (name) => features.includes(name) }),
}));

function renderStar(item, kind = "quote", queryClient = new QueryClient()) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <FavoriteStar kind={kind} item={item} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function okJson(body) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
}

afterEach(() => {
  features = [];
  vi.restoreAllMocks();
});

describe("FavoriteStar", () => {
  it("renders nothing without the favourites feature", () => {
    features = ["quotes_memes"];
    renderStar({ system_id: "Q1", is_favorite: true });
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("PUTs the flipped flag to /api/me/favorites/{kind}/{id}", async () => {
    features = ["favourites"];
    global.fetch = vi.fn(() => okJson({ kind: "meme", item_id: "M1", is_favorite: true }));
    renderStar({ system_id: "M1", is_favorite: false }, "meme");

    const star = screen.getByRole("button", { name: "Add to favourites" });
    expect(star).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(star);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/me/favorites/meme/M1");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ is_favorite: true });
  });

  it("clears a favourite and refetches every quote and meme list", async () => {
    features = ["favourites"];
    global.fetch = vi.fn(() => okJson({ kind: "quote", item_id: "Q1", is_favorite: false }));
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    renderStar({ system_id: "Q1", is_favorite: true }, "quote", queryClient);

    fireEvent.click(screen.getByRole("button", { name: "Remove from favourites" }));

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(4));
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ is_favorite: false });
    const keys = invalidate.mock.calls.map(([arg]) => arg.queryKey[0]);
    expect(keys).toEqual(["quotes-grouped", "quotes-by-entry", "memes-grouped", "memes-by-owner"]);
  });
});
