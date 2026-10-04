// The Meme tab body, shared by Modify (mode="modify") and Delete
// (mode="delete").
//
// On Delete the tab used to list up to 500 memes on mount and refetch on
// every keystroke. In delete mode it now asks for nothing until there is a
// search (debounced) or a picked owner; Modify still lists on mount.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

import MemeManageTab from "./MemeManageTab";

let fetchMock;
beforeEach(() => {
  fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => [],
  }));
  globalThis.fetch = fetchMock;
});

function mount(mode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemeManageTab mode={mode} />
    </QueryClientProvider>
  );
}

const listCalls = () =>
  fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith("/api/meme/"));

describe("MemeManageTab", () => {
  it("in delete mode, lists nothing until there is a search", async () => {
    mount("delete");
    expect(await screen.findByText(/search or pick an? \w+ to find memes/i)).toBeInTheDocument();
    // Long enough for a query that was going to fire to have fired.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(listCalls()).toEqual([]);
  });

  it("in delete mode, searches once the typing settles", async () => {
    const user = userEvent.setup();
    mount("delete");
    await user.type(screen.getByPlaceholderText(/search memes to delete/i), "kaze");
    await waitFor(() => expect(listCalls()).toHaveLength(1));
    expect(listCalls()[0]).toContain("search_query=kaze");
  });

  it("in modify mode, still lists on mount", async () => {
    mount("modify");
    await waitFor(() => expect(listCalls()).toEqual(["/api/meme/"]));
  });
});
