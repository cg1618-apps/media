// Frontend: the picker's one-line shape, used for a cast member's photo.
//
// Compact changes the layout, not the behaviour: the same three actions are
// there, under the same accessible names, and without an owner Remove only
// empties the value - a cast row has nothing on the server to clear.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import ImagePicker from "./ImagePicker";

function renderCompact(props = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onChange = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ImagePicker compact value="library/abc.jpg" onChange={onChange} {...props} />
    </QueryClientProvider>,
  );
  return onChange;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ImagePicker - compact", () => {
  it("offers upload, choose and remove beside a thumbnail", () => {
    renderCompact();

    expect(screen.getByLabelText("Upload")).toHaveAttribute("type", "file");
    expect(screen.getByRole("button", { name: "Choose from library" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove image" })).toBeInTheDocument();
    expect(screen.getByAltText("Current image")).toHaveClass("w-8", "h-8");
  });

  it("offers no remove when there is no image", () => {
    renderCompact({ value: "" });

    expect(screen.getByRole("button", { name: "Choose from library" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove image" })).not.toBeInTheDocument();
  });

  it("removes without an owner by emptying the value only", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const onChange = renderCompact();

    await userEvent.click(screen.getByRole("button", { name: "Remove image" }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("", null));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
