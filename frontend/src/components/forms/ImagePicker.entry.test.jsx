// Frontend: the library modal's "From an entry" tab.
//
// An entry's downloaded cover has no image row, so the library's filename
// search cannot find it. This tab searches entries instead (GET /api/search),
// offers only those with a stored cover, and on a pick copies that cover into
// the library (POST /api/images/from-entry) and attaches the returned row
// exactly as a library pick would.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import ImagePicker from "./ImagePicker";

const OWNER_ID = "11111111-1111-1111-1111-111111111111";
const WITH_COVER = "22222222-2222-2222-2222-222222222222";
const WITHOUT_COVER = "33333333-3333-3333-3333-333333333333";

const COPIED = {
  system_id: "img-1",
  storage_key: "library/abc.jpg",
  thumb_key: "library/thumbs/abc.jpg",
  attachments: [],
  missing: false,
};

function respond(body, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: () => Promise.resolve(body),
  });
}

function mockFetch({ copyFails = false } = {}) {
  const fetchMock = vi.fn((url, options = {}) => {
    if (url.startsWith("/api/search/")) {
      return respond({
        results: {
          anime: [
            {
              system_id: WITH_COVER,
              anime_name_en: "Frieren",
              cover_image_file: `anime/${WITH_COVER}.jpg`,
              cover_image_focus: "50% 20%",
            },
            {
              system_id: WITHOUT_COVER,
              anime_name_en: "Frieren Recap",
              cover_image_file: null,
            },
          ],
        },
      });
    }
    if (url === "/api/images/from-entry" && options.method === "POST") {
      return copyFails
        ? respond({ detail: "That entry's cover is not on this machine." }, false, 404)
        : respond(COPIED, true, 201);
    }
    if (url.includes("/attach") && options.method === "POST") {
      return respond({ system_id: "att-1" }, true, 201);
    }
    return respond({ images: [], total: 0 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPicker(props = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onChange = vi.fn();
  const onFocusChange = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ImagePicker
        ownerType="anime"
        ownerId={OWNER_ID}
        role="cover"
        value={null}
        onChange={onChange}
        onFocusChange={onFocusChange}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onChange, onFocusChange };
}

async function openEntryTab() {
  await userEvent.click(
    screen.getByRole("button", { name: /choose from library/i }),
  );
  await userEvent.click(screen.getByRole("tab", { name: /from an entry/i }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ImagePicker library modal - From an entry", () => {
  it("searches entries and offers only those with a stored cover", async () => {
    const fetchMock = mockFetch();
    renderPicker();
    await openEntryTab();

    fireEvent.change(screen.getByLabelText(/search entries/i), {
      target: { value: "frieren" },
    });

    const pick = await screen.findByRole("button", { name: /frieren/i });
    expect(pick).toHaveTextContent("Anime");
    expect(
      screen.queryByRole("button", { name: /frieren recap/i }),
    ).not.toBeInTheDocument();
    const searchCall = fetchMock.mock.calls.find(([url]) =>
      url.startsWith("/api/search/"),
    );
    expect(searchCall[0]).toContain("q=frieren");
    // The thumbnail is the entry's cover, at thumbnail size, in its focus.
    const thumb = pick.querySelector("img");
    expect(thumb.getAttribute("src")).toBe(
      `/api/covers/anime/${WITH_COVER}.jpg?size=thumb`,
    );
    expect(thumb.style.objectPosition).toBe("50% 20%");
  });

  it("copies the cover into the library, then attaches it like a library pick", async () => {
    const fetchMock = mockFetch();
    const { onChange, onFocusChange } = renderPicker();
    await openEntryTab();
    fireEvent.change(screen.getByLabelText(/search entries/i), {
      target: { value: "frieren" },
    });
    await userEvent.click(await screen.findByRole("button", { name: /frieren/i }));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const copy = fetchMock.mock.calls.find(
      ([url]) => url === "/api/images/from-entry",
    );
    expect(JSON.parse(copy[1].body)).toEqual({
      media_type: "anime",
      entry_id: WITH_COVER,
    });
    const attach = fetchMock.mock.calls.find(([url]) =>
      url.includes("/api/images/img-1/attach"),
    );
    expect(JSON.parse(attach[1].body)).toMatchObject({
      owner_type: "anime",
      owner_id: OWNER_ID,
      role: "cover",
    });
    expect(onChange).toHaveBeenCalledWith("library/abc.jpg", "img-1");
    expect(onFocusChange).toHaveBeenCalledWith(null);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows a failed copy in the modal and changes nothing", async () => {
    mockFetch({ copyFails: true });
    const { onChange } = renderPicker();
    await openEntryTab();
    fireEvent.change(screen.getByLabelText(/search entries/i), {
      target: { value: "frieren" },
    });
    await userEvent.click(await screen.findByRole("button", { name: /frieren/i }));

    expect(
      await screen.findByText(/not on this machine/i),
    ).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
