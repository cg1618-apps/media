// Frontend: tests for an author's gallery of works on the person page.
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import WorkGallery from "./WorkGallery";

const AUTHOR = {
  system_id: "p-1",
  roles: [{ role: "author", scope: "manga" }],
};

const picture = (id, position, caption = null) => ({
  system_id: id,
  image_id: `img-${id}`,
  storage_key: `library/${id}.jpg`,
  thumb_key: `library/thumbs/${id}.jpg`,
  caption,
  position,
});

let answer;

beforeEach(() => {
  answer = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => answer()),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WorkGallery", () => {
  it("draws the pictures in order, with their captions, each opening the full picture", async () => {
    const rows = [picture("a", 0, "Volume 1"), picture("b", 1)];
    answer = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(rows) });

    render(<WorkGallery person={AUTHOR} />);

    const list = await screen.findByRole("list", { name: "Works" });
    const links = list.querySelectorAll("a");
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute("href")).toBe("/static/library/a.jpg");
    expect(links[0].getAttribute("target")).toBe("_blank");
    expect(screen.getByText("Volume 1")).toBeTruthy();
    expect(list.querySelector("img").getAttribute("src")).toBe("/static/library/thumbs/a.jpg");
    expect(fetch).toHaveBeenCalledWith("/api/person/p-1/work-images", expect.anything());
  });

  it("draws nothing for an empty gallery", async () => {
    const { container } = render(<WorkGallery person={AUTHOR} />);

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container.innerHTML).toBe("");
  });

  it("does not ask for a person who is neither author nor illustrator", () => {
    const { container } = render(
      <WorkGallery person={{ system_id: "p-2", roles: [{ role: "director", scope: "anime" }] }} />,
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe("");
  });

  it("says so when the gallery cannot be read", async () => {
    answer = () =>
      Promise.resolve({
        ok: false,
        status: 500,
        statusText: "Server Error",
        json: () => Promise.resolve({ detail: "boom" }),
      });

    render(<WorkGallery person={AUTHOR} />);

    expect(await screen.findByText("Works could not be loaded.")).toBeTruthy();
  });
});
