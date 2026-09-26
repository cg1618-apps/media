// Frontend: the manager grid renders thumb_key when present, falling back to
// the full-size storage_key only for backfilled legacy rows that have no
// thumbnail. Before this, both the manager and the picker rendered
// storage_key unconditionally, so every grid tile downloaded a full 2000px
// JPEG despite thumb_key already being generated and stored.
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import Images from "./Images";

const IMAGES = [
  {
    system_id: "img-1",
    storage_key: "library/full-1.jpg",
    thumb_key: "library/thumb-1.jpg",
    attachments: [],
  },
  {
    system_id: "img-2",
    storage_key: "library/full-2.jpg",
    thumb_key: null,
    attachments: [],
  },
];

vi.mock("../../hooks/useImages", () => ({
  useImages: () => ({
    data: { images: IMAGES, total: IMAGES.length },
    isLoading: false,
  }),
  useUploadImage: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDetachImage: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteImage: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe("Images manager", () => {
  it("renders thumb_key when present, and falls back to storage_key otherwise", () => {
    const { container } = render(<Images />);
    // The tile <img> renders with alt="" (decorative), which gives it the
    // "presentation" ARIA role rather than "img" - queried by tag instead.
    const imgs = Array.from(container.querySelectorAll("img"));
    const srcs = imgs.map((img) => img.getAttribute("src"));
    expect(srcs).toContain("/static/library/thumb-1.jpg");
    expect(srcs).toContain("/static/library/full-2.jpg");
    expect(srcs).not.toContain("/static/library/full-1.jpg");
  });
});

describe("Images manager - backfilled legacy rows", () => {
  it("renders a tile for a backfilled-style row without doubling covers/", async () => {
    vi.resetModules();
    vi.doMock("../../hooks/useImages", () => ({
      useImages: () => ({
        data: {
          images: [
            {
              system_id: "img-legacy",
              storage_key: "covers/anime/x.jpg",
              thumb_key: null,
              attachments: [],
            },
          ],
          total: 1,
        },
        isLoading: false,
      }),
      useUploadImage: () => ({ mutateAsync: vi.fn(), isPending: false }),
      useDetachImage: () => ({ mutateAsync: vi.fn(), isPending: false }),
      useDeleteImage: () => ({ mutateAsync: vi.fn(), isPending: false }),
    }));
    const { default: ImagesWithLegacyRow } = await import("./Images");
    const { container } = render(<ImagesWithLegacyRow />);
    const imgs = Array.from(container.querySelectorAll("img"));
    const srcs = imgs.map((img) => img.getAttribute("src"));
    expect(srcs).toContain("/api/covers/anime/x.jpg");
  });
});

describe("Images manager - cast photos", () => {
  it("shows a cast photo as in use and refuses to delete it", async () => {
    // A cast photo has no attachment row, so without cast_photo_count the
    // tile would read Unused and offer a Delete the server refuses. The
    // loose image beside it proves Delete is still offered when nothing
    // uses the image.
    vi.resetModules();
    vi.doMock("../../hooks/useImages", () => ({
      useImages: () => ({
        data: {
          images: [
            {
              system_id: "img-cast",
              storage_key: "library/cast.jpg",
              original_filename: "cast.jpg",
              attachments: [],
              cast_photo_count: 2,
            },
            {
              system_id: "img-loose",
              storage_key: "library/loose.jpg",
              original_filename: "loose.jpg",
              attachments: [],
              cast_photo_count: 0,
            },
          ],
          total: 2,
        },
        isLoading: false,
      }),
      useUploadImage: () => ({ mutateAsync: vi.fn(), isPending: false }),
      useDetachImage: () => ({ mutateAsync: vi.fn(), isPending: false }),
      useDeleteImage: () => ({ mutateAsync: vi.fn(), isPending: false }),
    }));
    const { default: ImagesWithCastPhoto } = await import("./Images");
    const { getByText, getAllByRole } = render(<ImagesWithCastPhoto />);

    expect(getByText("Cast photo ×2")).toBeInTheDocument();
    const [castDelete, looseDelete] = getAllByRole("button", { name: "Delete" });
    expect(castDelete).toBeDisabled();
    expect(looseDelete).toBeEnabled();
  });
});
