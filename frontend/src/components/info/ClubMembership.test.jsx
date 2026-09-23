// Frontend: tests for club membership on the person page.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ClubMembership from "./ClubMembership";

const auth = { isAdmin: true, visibleGatedTypes: ["h-comic"] };
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const CLUB = {
  system_id: "club-1",
  public_id: 9,
  display_name: "Circle Nine",
  roles: [{ role: "club", scope: "h-comic" }],
};

const ref = (id, name, position = 0) => ({
  system_id: id,
  public_id: position + 1,
  display_name: name,
  position,
});

let putBodies;

beforeEach(() => {
  auth.isAdmin = true;
  auth.visibleGatedTypes = ["h-comic"];
  putBodies = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url, init = {}) => {
      if (init.method === "PUT") {
        const body = JSON.parse(init.body);
        putBodies.push({ url, body });
        const rows = body.member_ids.map((id, i) => ref(id, id === "a" ? "Ahn" : "Baek", i));
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(rows) });
      }
      const rows = url.endsWith("/members")
        ? [ref("a", "Ahn", 0), ref("b", "Baek", 1)]
        : url.endsWith("/clubs")
          ? []
          : [];
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(rows) });
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const renderFor = (person) =>
  render(
    <MemoryRouter>
      <ClubMembership person={person} />
    </MemoryRouter>
  );

describe("ClubMembership", () => {
  it("lists a club's members in the club's order", async () => {
    renderFor(CLUB);
    const list = await screen.findByRole("list", { name: "Members" });
    const names = within(list)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(names).toEqual(["Ahn", "Baek"]);
  });

  it("saves a reordered member list whole, in display order", async () => {
    const user = userEvent.setup();
    renderFor(CLUB);
    await screen.findByRole("list", { name: "Members" });
    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    await user.click(screen.getByRole("button", { name: "Move Baek up" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(putBodies).toHaveLength(1));
    expect(putBodies[0].url).toBe("/api/person/club-1/members");
    expect(putBodies[0].body).toEqual({ member_ids: ["b", "a"] });
  });

  it("draws nothing, and asks nothing, for a session that cannot see h-comic", () => {
    auth.visibleGatedTypes = [];
    const { container } = renderFor(CLUB);
    expect(container).toBeEmptyDOMElement();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("offers a reader no editor", async () => {
    auth.isAdmin = false;
    renderFor(CLUB);
    await screen.findByRole("list", { name: "Members" });
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });
});
