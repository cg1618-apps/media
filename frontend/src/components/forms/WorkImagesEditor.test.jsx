// Frontend: tests for the gallery-of-works editor in the person form.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import WorkImagesEditor from "./WorkImagesEditor";

const picture = (id, position, caption = null) => ({
  system_id: id,
  image_id: `img-${id}`,
  storage_key: `library/${id}.jpg`,
  thumb_key: `library/thumbs/${id}.jpg`,
  caption,
  position,
});

const ok = (body, status = 200) =>
  Promise.resolve({ ok: true, status, json: () => Promise.resolve(body) });

let calls;
let gallery;

beforeEach(() => {
  calls = [];
  gallery = [picture("a", 0, "First"), picture("b", 1)];
  vi.stubGlobal(
    "fetch",
    vi.fn((url, init = {}) => {
      const method = init.method || "GET";
      calls.push({ url, method, body: init.body });
      if (method === "PUT") {
        const { attachment_ids } = JSON.parse(init.body);
        const byId = Object.fromEntries(gallery.map((p) => [p.system_id, p]));
        gallery = attachment_ids.map((id, i) => ({ ...byId[id], position: i }));
        return ok(gallery);
      }
      if (method === "PATCH") {
        const { caption } = JSON.parse(init.body);
        return ok({ ...gallery[1], caption });
      }
      if (method === "DELETE") return Promise.resolve({ ok: true, status: 204, json: () => null });
      if (method === "POST") return ok([...gallery, picture("c", 2)], 201);
      return ok(gallery);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderEditor() {
  render(<WorkImagesEditor personId="p-1" />);
  await screen.findByRole("list", { name: "Works being edited" });
}

describe("WorkImagesEditor", () => {
  it("shows a loading line, then the pictures with their captions", async () => {
    render(<WorkImagesEditor personId="p-1" />);
    expect(screen.getByText("Loading works…")).toBeTruthy();

    await screen.findByRole("list", { name: "Works being edited" });
    expect(screen.getByDisplayValue("First")).toBeTruthy();
  });

  it("says what to do when there are no works", async () => {
    gallery = [];
    render(<WorkImagesEditor personId="p-1" />);

    expect(await screen.findByText(/No works yet/)).toBeTruthy();
  });

  it("uploads every chosen file in one request", async () => {
    await renderEditor();
    const input = screen.getByTestId("work-images-input");
    const files = [
      new File(["x"], "one.png", { type: "image/png" }),
      new File(["y"], "two.png", { type: "image/png" }),
    ];

    fireEvent.change(input, { target: { files } });

    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    const post = calls.find((c) => c.method === "POST");
    expect(post.url).toBe("/api/person/p-1/work-images");
    expect(post.body.getAll("files")).toHaveLength(2);
    expect(await screen.findAllByRole("listitem")).toHaveLength(3);
  });

  it("saves a caption on blur", async () => {
    await renderEditor();
    const input = screen.getByLabelText("Caption for picture 2");

    fireEvent.change(input, { target: { value: "Volume 2" } });
    fireEvent.blur(input);

    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch.url).toBe("/api/person/p-1/work-images/b");
    expect(JSON.parse(patch.body)).toEqual({ caption: "Volume 2" });
  });

  it("does not save a caption that did not change", async () => {
    await renderEditor();
    fireEvent.blur(screen.getByLabelText("Caption for picture 1"));

    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("reorders by the grip's arrow keys and saves the whole order", async () => {
    await renderEditor();

    fireEvent.keyDown(screen.getByRole("button", { name: "Reorder First" }), { key: "ArrowDown" });

    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    const put = calls.find((c) => c.method === "PUT");
    expect(JSON.parse(put.body)).toEqual({ attachment_ids: ["b", "a"] });
  });

  it("removes a picture", async () => {
    await renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "Remove First" }));

    await waitFor(() => expect(screen.queryByDisplayValue("First")).toBeNull());
    const del = calls.find((c) => c.method === "DELETE");
    expect(del.url).toBe("/api/person/p-1/work-images/a");
  });

  it("shows the server's refusal", async () => {
    await renderEditor();
    fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 422,
        statusText: "Unprocessable",
        json: () => Promise.resolve({ detail: "Only an author or illustrator has a gallery of works" }),
      }),
    );

    fireEvent.change(screen.getByTestId("work-images-input"), {
      target: { files: [new File(["x"], "one.png", { type: "image/png" })] },
    });

    expect(await screen.findByText(/Only an author or illustrator/)).toBeTruthy();
  });
});
