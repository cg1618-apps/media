// Frontend: the picker's Remove control.
//
// With an owner, Remove clears the image on the server at once - the same
// timing attach has - and only then empties the form; a refused clear leaves
// the form alone and says why. Without an owner (an Add form before its first
// save) there is nothing on the server, so it only empties the form.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import ImagePicker from "./ImagePicker";

const OWNER_ID = "11111111-1111-1111-1111-111111111111";

function mockFetch({ ok = true, status = 204, detail } = {}) {
  const fetchMock = vi.fn(() =>
    Promise.resolve({
      ok,
      status,
      json: () => Promise.resolve(detail ? { detail } : null),
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPicker(props = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onChange = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ImagePicker
        ownerType="anime"
        ownerId={OWNER_ID}
        role="cover"
        value={`anime/${OWNER_ID}.jpg`}
        onChange={onChange}
        {...props}
      />
    </QueryClientProvider>,
  );
  return onChange;
}

function removeButton() {
  return screen.getByRole("button", { name: /^remove$/i });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ImagePicker - Remove", () => {
  it("is not offered when there is no image", () => {
    renderPicker({ value: null });
    expect(
      screen.queryByRole("button", { name: /^remove$/i }),
    ).not.toBeInTheDocument();
  });

  it("clears the owner's image on the server, then empties the form", async () => {
    const fetchMock = mockFetch();
    const onChange = renderPicker();

    await userEvent.click(removeButton());

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("", null));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/images/owners/anime/${OWNER_ID}/cover`);
    expect(init.method).toBe("DELETE");
  });

  it("keeps the image and shows the error when the clear is refused", async () => {
    mockFetch({ ok: false, status: 404, detail: "Entry not found." });
    const onChange = renderPicker();

    await userEvent.click(removeButton());

    expect(await screen.findByText(/entry not found/i)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("only empties the form when there is no owner yet", async () => {
    const fetchMock = mockFetch();
    const onChange = renderPicker({
      ownerId: undefined,
      value: "library/abc123.jpg",
    });

    await userEvent.click(removeButton());

    expect(onChange).toHaveBeenCalledWith("", null);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
