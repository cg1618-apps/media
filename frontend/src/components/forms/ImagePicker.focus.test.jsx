// Frontend: the picker's focal-point wiring.
//
// A focus belongs to the picture it was set on, so every way of changing the
// picture clears it in the form as well as on the server - otherwise saving
// the form would stamp the old picture's focus onto the new one.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import ImagePicker from "./ImagePicker";

function renderPicker(props = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onChange = vi.fn();
  const onFocusChange = vi.fn();
  const utils = render(
    <QueryClientProvider client={client}>
      <ImagePicker
        value="library/old.jpg"
        focus="20% 10%"
        onChange={onChange}
        onFocusChange={onFocusChange}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onChange, onFocusChange, ...utils };
}

function mockFetch(responder) {
  const fetchMock = vi.fn((url) =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(responder(url)),
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const adjustButton = () =>
  screen.queryByRole("button", { name: "Adjust position" });

describe("ImagePicker - focal point", () => {
  it("offers Adjust position only with an image and an onFocusChange", () => {
    const first = renderPicker({ onFocusChange: undefined });
    expect(adjustButton()).not.toBeInTheDocument();
    first.unmount();

    const second = renderPicker({ value: "" });
    expect(adjustButton()).not.toBeInTheDocument();
    second.unmount();

    renderPicker();
    expect(adjustButton()).toBeInTheDocument();
  });

  it("clears the focus when a new image is chosen from the library", async () => {
    mockFetch(() => ({
      images: [
        {
          system_id: "new",
          storage_key: "library/new.jpg",
          thumb_key: null,
          original_filename: "new.jpg",
          attachments: [],
          missing: false,
        },
      ],
      total: 1,
    }));
    const { onChange, onFocusChange } = renderPicker();

    await userEvent.click(
      screen.getByRole("button", { name: /choose from library/i }),
    );
    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(dialog.querySelector('img[src="/static/library/new.jpg"]')).not.toBeNull(),
    );
    await userEvent.click(
      dialog.querySelector('img[src="/static/library/new.jpg"]').closest("button"),
    );

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith("library/new.jpg", "new"),
    );
    expect(onFocusChange).toHaveBeenCalledWith(null);
  });

  it("clears the focus when the image is removed", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { onChange, onFocusChange } = renderPicker({ compact: true });

    await userEvent.click(screen.getByRole("button", { name: "Remove image" }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("", null));
    expect(onFocusChange).toHaveBeenCalledWith(null);
  });

  it("opens the focus picker and reports the chosen point", async () => {
    const { onFocusChange } = renderPicker();

    await userEvent.click(adjustButton());
    const marker = screen.getByRole("button", { name: /focal point/i });
    expect(marker).toHaveAccessibleName("Focal point, 20% across, 10% down");
    marker.focus();
    await userEvent.keyboard("{ArrowRight}");
    await userEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(onFocusChange).toHaveBeenCalledWith("21% 10%");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("applies the focus to the compact thumbnail and offers the icon control", () => {
    renderPicker({ compact: true });

    expect(screen.getByAltText("Current image")).toHaveStyle({
      objectPosition: "20% 10%",
    });
    expect(adjustButton()).toBeInTheDocument();
  });
});
