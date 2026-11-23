// Frontend: tests for the related records on a studio's, a publisher's or a
// franchise's page - and in their Modify forms, which render the same box.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import RelatedRecords, { alsoRelatedTargets, pickerItems, recordName } from "./RelatedRecords";

vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
// A reader on a studio's page may open studio and publisher pages, so the
// rows are links.
vi.mock("../../hooks/useViewScope", () => ({
  useViewScope: () => ({ studio: true, publisher: true, person: true, character: true }),
}));

const ref = (kind, id, name, remark = null) => ({
  kind,
  system_id: id,
  public_id: id.length,
  display_name: name,
  remark,
});

const NAMES = { b: "Studio Bee", c: "Studio Sea", d: "Studio Dee", p: "Pub Pea" };

let related;
let putBodies;

beforeEach(() => {
  related = [
    ref("studio", "b", "Studio Bee", "animation subsidiary"),
    ref("publisher", "p", "Pub Pea"),
  ];
  putBodies = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url, init = {}) => {
      const u = String(url);
      if (init.method === "PUT") {
        const body = JSON.parse(init.body);
        putBodies.push({ url: u, body });
        const rows = body.relations.map((r) => ref(r.kind, r.id, NAMES[r.id], r.remark));
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(rows) });
      }
      let rows = [];
      if (u.endsWith("/related")) rows = related;
      else if (u.startsWith("/api/studio/")) {
        rows = [
          { system_id: "a", public_id: 1, display_name: "Studio Ay" },
          { system_id: "d", public_id: 4, display_name: "Studio Dee" },
        ];
      } else if (u.startsWith("/api/publisher/")) {
        rows = [{ system_id: "a", public_id: 9, display_name: "Pub Ay" }];
      } else if (u.startsWith("/api/franchise/")) {
        // The franchise list carries no display_name.
        rows = [{ system_id: "f", public_id: 6, franchise_name_cn: "進擊的巨人" }];
      }
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
  it("lists studios and publishers, each linked to its own page and marked with its kind", async () => {
    mount();
    const list = await screen.findByRole("list", { name: "Related companies" });
    expect(list).toHaveTextContent("Studio Bee");
    expect(list).toHaveTextContent("animation subsidiary");
    expect(screen.getByRole("link", { name: "Pub Pea" }).getAttribute("href")).toMatch(
      /^\/publisher\//,
    );
    expect(screen.getByRole("link", { name: "Studio Bee" }).getAttribute("href")).toMatch(
      /^\/studio\//,
    );
    expect(screen.getByText("Pub Pea").closest("li")).toHaveTextContent("Publisher");
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
    expect(await screen.findByText("No related companies.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("saves the whole list with each row's kind and remark, blank as null", async () => {
    const user = userEvent.setup();
    mount(true);
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.type(screen.getByRole("textbox", { name: "Remark for Pub Pea" }), "distributor");
    fireEvent.change(screen.getByRole("textbox", { name: "Remark for Studio Bee" }), {
      target: { value: "  " },
    });
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(putBodies).toHaveLength(1));
    expect(putBodies[0].url).toBe("/api/studio/a/related");
    expect(putBodies[0].body).toEqual({
      relations: [
        { kind: "studio", id: "b", remark: null },
        { kind: "publisher", id: "p", remark: "distributor" },
      ],
    });
  });

  it("removes a row before saving", async () => {
    const user = userEvent.setup();
    mount(true);
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Remove Studio Bee" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(putBodies).toHaveLength(1));
    expect(putBodies[0].body.relations.map((r) => r.id)).toEqual(["p"]);
  });

  it("relates an added record to the others on the list, ticked by default", async () => {
    const user = userEvent.setup();
    mount(true);
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.type(screen.getByPlaceholderText("Search to add…"), "Dee");
    await user.click(await screen.findByRole("option", { name: /Studio Dee/ }));
    const group = screen.getByRole("group", { name: "Also relate Studio Dee to" });
    expect(screen.getByRole("checkbox", { name: "Studio Bee" })).toBeChecked();
    expect(group).toContainElement(screen.getByRole("checkbox", { name: "Pub Pea" }));
    await user.click(screen.getByRole("checkbox", { name: "Pub Pea" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(putBodies).toHaveLength(1));
    expect(putBodies[0].body.relations).toEqual([
      { kind: "studio", id: "b", remark: "animation subsidiary" },
      { kind: "publisher", id: "p", remark: null },
      {
        kind: "studio",
        id: "d",
        remark: null,
        also_related_to: [{ kind: "studio", id: "b" }],
      },
    ]);
  });

  it("offers no ticks on records that were already related", async () => {
    const user = userEvent.setup();
    mount(true);
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("asks both lists for candidates when editing starts", async () => {
    const user = userEvent.setup();
    mount(true);
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await waitFor(() => {
      const urls = fetch.mock.calls.map(([u]) => String(u));
      expect(urls).toContain("/api/studio/");
      expect(urls).toContain("/api/publisher/");
    });
  });
});

describe("RelatedRecords on a publisher", () => {
  it("reads and writes the publisher routes", async () => {
    const user = userEvent.setup();
    mount(true, "publisher");
    expect(await screen.findByRole("list", { name: "Related companies" })).toBeInTheDocument();
    expect(String(fetch.mock.calls[0][0])).toBe("/api/publisher/a/related");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(putBodies).toHaveLength(1));
    expect(putBodies[0].url).toBe("/api/publisher/a/related");
  });
});

describe("RelatedRecords on a franchise", () => {
  it("reads and writes the franchise routes, under its own title", async () => {
    const user = userEvent.setup();
    related = [];
    mount(true, "franchise");
    expect(await screen.findByText("No related franchises.")).toBeInTheDocument();
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

describe("alsoRelatedTargets", () => {
  // Two records added in one edit offer their pair once - on the later one -
  // so one tick decides it and the two can never disagree.
  it("offers an added record only the records above it", () => {
    const draft = [
      ref("studio", "b", "Bee"),
      { ...ref("studio", "c", "Sea"), isNew: true, unticked: [] },
      { ...ref("studio", "d", "Dee"), isNew: true, unticked: [] },
    ];
    expect(alsoRelatedTargets(draft, 1).map((r) => r.system_id)).toEqual(["b"]);
    expect(alsoRelatedTargets(draft, 2).map((r) => r.system_id)).toEqual(["b", "c"]);
  });

  it("offers nothing on a record that was already related", () => {
    const draft = [ref("studio", "b", "Bee"), ref("studio", "c", "Sea")];
    expect(alsoRelatedTargets(draft, 1)).toEqual([]);
  });
});

describe("pickerItems", () => {
  it("offers neither the page's own record nor one already chosen", () => {
    const candidates = {
      studio: [
        { system_id: "a", display_name: "Ay" },
        { system_id: "b", display_name: "Bee" },
      ],
      publisher: [{ system_id: "a", display_name: "Pub Ay" }],
    };
    const chosen = [ref("studio", "b", "Bee")];
    // The publisher sharing the page's id is a different record, so it stays.
    expect(pickerItems(candidates, chosen, { kind: "studio", id: "a" }).map((i) => i.id)).toEqual([
      "publisher:a",
    ]);
  });

  it("marks each row with its kind when two kinds are offered", () => {
    const candidates = {
      studio: [{ system_id: "s", display_name: "Shaft" }],
      publisher: [{ system_id: "p", display_name: "Aniplex" }],
    };
    expect(pickerItems(candidates, [], { kind: "studio", id: "x" }).map((i) => i.label)).toEqual([
      "Shaft · Studio",
      "Aniplex · Publisher",
    ]);
  });

  it("names a franchise from its own columns, never Unknown", () => {
    const franchise = {
      system_id: "f",
      franchise_name_cn: "進擊的巨人",
      franchise_name_en: "Attack on Titan",
    };
    const [item] = pickerItems({ franchise: [franchise] }, [], { kind: "franchise", id: "a" });
    expect(item.label).toBe(recordName(franchise, "franchise"));
    expect(item.label).not.toBe("Unknown");
    expect(item.searchText).toContain("Attack on Titan");
  });
});
