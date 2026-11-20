// Frontend: tests for the related studios on a studio's page.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import RelatedStudios, { pickerItems } from "./RelatedStudios";

vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
// A reader on a studio's page may open studio pages, so the rows are links.
vi.mock("../../hooks/useViewScope", () => ({
  useViewScope: () => ({ studio: true, publisher: true, person: true, character: true }),
}));

const ref = (id, name, remark = null) => ({
  system_id: id,
  public_id: id.length,
  display_name: name,
  remark,
});

let related;
let putBodies;

beforeEach(() => {
  related = [ref("b", "Studio Bee", "animation subsidiary"), ref("c", "Studio Sea")];
  putBodies = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url, init = {}) => {
      const u = String(url);
      if (init.method === "PUT") {
        const body = JSON.parse(init.body);
        putBodies.push({ url: u, body });
        const names = { b: "Studio Bee", c: "Studio Sea", d: "Studio Dee" };
        const rows = body.relations.map((r) => ref(r.studio_id, names[r.studio_id], r.remark));
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(rows) });
      }
      const rows = u.endsWith("/related")
        ? related
        : [ref("a", "Studio Ay"), ref("b", "Studio Bee"), ref("d", "Studio Dee")];
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(rows) });
    }),
  );
});

function mount(isAdmin = false) {
  return render(
    <MemoryRouter>
      <RelatedStudios studioId="a" isAdmin={isAdmin} />
    </MemoryRouter>,
  );
}

describe("RelatedStudios", () => {
  it("lists each related studio as a link with this side's remark", async () => {
    mount();
    const list = await screen.findByRole("list", { name: "Related studios" });
    expect(list).toHaveTextContent("Studio Bee — animation subsidiary");
    expect(screen.getByRole("link", { name: "Studio Bee" })).toBeInTheDocument();
    // No remark, no dash.
    expect(screen.getByText("Studio Sea").closest("li")).toHaveTextContent(/^Studio Sea$/);
    expect(String(fetch.mock.calls[0][0])).toBe("/api/studio/a/related");
  });

  it("draws nothing for a reader when there is nothing related", async () => {
    related = [];
    const { container } = mount(false);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("offers an admin the empty frame to start from", async () => {
    related = [];
    mount(true);
    expect(await screen.findByText("No related studios.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("saves the whole list with each row's remark, blank as null", async () => {
    const user = userEvent.setup();
    mount(true);
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const remark = screen.getByRole("textbox", { name: "Remark for Studio Sea" });
    await user.type(remark, "sister studio");
    fireEvent.change(screen.getByRole("textbox", { name: "Remark for Studio Bee" }), {
      target: { value: "  " },
    });
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(putBodies).toHaveLength(1));
    expect(putBodies[0].url).toBe("/api/studio/a/related");
    expect(putBodies[0].body).toEqual({
      relations: [
        { studio_id: "b", remark: null },
        { studio_id: "c", remark: "sister studio" },
      ],
    });
    expect(await screen.findByText(/sister studio/)).toBeInTheDocument();
  });

  it("removes a row before saving", async () => {
    const user = userEvent.setup();
    mount(true);
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Remove Studio Bee" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(putBodies).toHaveLength(1));
    expect(putBodies[0].body.relations.map((r) => r.studio_id)).toEqual(["c"]);
  });
});

describe("pickerItems", () => {
  it("offers neither the page's own studio nor one already chosen", () => {
    const studios = [ref("a", "Ay"), ref("b", "Bee"), ref("d", "Dee")];
    expect(pickerItems(studios, [ref("b", "Bee")], "a").map((i) => i.id)).toEqual(["d"]);
  });
});
