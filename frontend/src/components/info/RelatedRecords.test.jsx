// Frontend: tests for the related records on a studio's or a franchise's page.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import RelatedRecords, { pickerItems } from "./RelatedRecords";

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
        const rows = body.relations.map((r) => ref(r.id, names[r.id], r.remark));
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(rows) });
      }
      const rows = u.endsWith("/related")
        ? related
        : [ref("a", "Studio Ay"), ref("b", "Studio Bee"), ref("d", "Studio Dee")];
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(rows) });
    }),
  );
});

function mount(isAdmin = false, type = "studio") {
  return render(
    <MemoryRouter>
      <RelatedRecords type={type} recordId="a" isAdmin={isAdmin} />
    </MemoryRouter>,
  );
}

describe("RelatedRecords on a studio", () => {
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
        { id: "b", remark: null },
        { id: "c", remark: "sister studio" },
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
    expect(putBodies[0].body.relations.map((r) => r.id)).toEqual(["c"]);
  });
});

describe("RelatedRecords on a franchise", () => {
  it("reads and writes the franchise routes, under its own title", async () => {
    const user = userEvent.setup();
    mount(true, "franchise");
    expect(await screen.findByRole("list", { name: "Related franchises" })).toBeInTheDocument();
    expect(String(fetch.mock.calls[0][0])).toBe("/api/franchise/a/related");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    // Every franchise, past the list route's default page of 500.
    await waitFor(() =>
      expect(fetch.mock.calls.map(([u]) => String(u))).toContain("/api/franchise/?limit=2000"),
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(putBodies).toHaveLength(1));
    expect(putBodies[0].url).toBe("/api/franchise/a/related");
  });
});

describe("pickerItems", () => {
  it("offers neither the page's own record nor one already chosen", () => {
    const studios = [ref("a", "Ay"), ref("b", "Bee"), ref("d", "Dee")];
    expect(pickerItems(studios, [ref("b", "Bee")], "a").map((i) => i.id)).toEqual(["d"]);
  });

  it("searches every name field the kind names", () => {
    const franchise = { ...ref("f", "進撃の巨人"), franchise_name_en: "Attack on Titan" };
    const [item] = pickerItems([franchise], [], "a", ["franchise_name_en"]);
    expect(item.searchText).toContain("Attack on Titan");
  });
});
