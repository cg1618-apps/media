// Frontend: tests for reordering in the watch-order editor.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import WatchOrderEditor from "./WatchOrderEditor";

const auth = { isAdmin: true, visibleGatedTypes: [] };
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => auth }));
const showToast = vi.fn();
vi.mock("../../hooks/useToast", () => ({ useToast: () => ({ showToast }) }));

const step = (id, sectionId, position) => ({
  system_id: id,
  section_id: sectionId,
  position,
  media_type: "anime",
  entry_id: `entry-${id}`,
  display_name: `Show ${id}`,
  missing: false,
});

// [Part One: A B] C [Part Two: D]
function freshList() {
  return {
    system_id: "list-1",
    list_name: "Order",
    list_type: "Custom",
    auto_source: null,
    media_types: [],
    sections: [
      { system_id: "p1", section_name: "Part One", position: 1 },
      { system_id: "p2", section_name: "Part Two", position: 4 },
    ],
    items: [
      step("a", "p1", 1),
      step("b", "p1", 2),
      step("c", null, 3),
      step("d", "p2", 4),
    ],
  };
}

let server;
let calls;
let pending;

const json = (body) => ({ ok: true, status: 200, json: () => Promise.resolve(body) });

beforeEach(() => {
  showToast.mockReset();
  server = freshList();
  calls = [];
  pending = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url, init = {}) => {
      const method = init.method || "GET";
      calls.push({ url, method, body: init.body ? JSON.parse(init.body) : null });
      if (method === "GET") {
        return Promise.resolve(json(url.includes("candidates") ? [] : server));
      }
      // Writes stay in flight until the test lets them land.
      return new Promise((resolve) => {
        pending.push(() => {
          if (url.endsWith("/reorder")) {
            const body = JSON.parse(init.body);
            const byId = new Map(server.items.map((i) => [i.system_id, i]));
            server = {
              ...server,
              items: body.item_ids.map((id, i) => ({
                ...byId.get(id),
                section_id: body.section_ids[i],
                position: i + 1,
              })),
              sections: server.sections
                .map((s) => ({
                  ...s,
                  position: body.section_positions.find((p) => p.section_id === s.system_id)
                    .position,
                }))
                .sort((x, y) => x.position - y.position),
            };
          }
          resolve(json(server));
        });
      });
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderEditor() {
  render(
    <MemoryRouter>
      <WatchOrderEditor listId="list-1" />
    </MemoryRouter>
  );
  await screen.findByLabelText("Reorder Show a");
}

const writes = () => calls.filter((c) => c.method !== "GET");

async function land() {
  await act(async () => {
    pending.splice(0).forEach((resolve) => resolve());
  });
}

const stepNames = () =>
  screen
    .getAllByLabelText(/^Reorder Show /)
    .map((el) => el.getAttribute("aria-label").replace("Reorder Show ", ""));

describe("WatchOrderEditor reordering", () => {
  it("has drag grips for steps and parts and no arrow buttons", async () => {
    await renderEditor();
    expect(screen.getByLabelText("Reorder Show c")).toHaveClass("touch-none");
    expect(screen.getByLabelText("Reorder part Part One")).toBeInTheDocument();
    expect(screen.queryByLabelText("Move up")).toBeNull();
    expect(screen.queryByLabelText("Move down")).toBeNull();
    expect(screen.queryByLabelText("Move part up")).toBeNull();
    expect(screen.queryByLabelText("Move part down")).toBeNull();
    // The typed position box stays.
    expect(screen.getByLabelText("Position, currently 3 of 4")).toBeInTheDocument();
  });

  it("moves a step one place with ArrowUp on its grip, crossing into a part", async () => {
    await renderEditor();
    fireEvent.keyDown(screen.getByLabelText("Reorder Show c"), { key: "ArrowUp" });
    expect(stepNames()).toEqual(["a", "c", "b", "d"]);
    expect(writes()).toHaveLength(1);
    expect(writes()[0].url).toBe("/api/watch-order/lists/list-1/reorder");
    expect(writes()[0].body.item_ids).toEqual(["a", "c", "b", "d"]);
    // c lands between two steps of Part One, so it joins it.
    expect(writes()[0].body.section_ids).toEqual(["p1", "p1", "p1", "p2"]);
    await land();
    expect(stepNames()).toEqual(["a", "c", "b", "d"]);
  });

  it("keeps focus on the moved step's grip", async () => {
    await renderEditor();
    const grip = screen.getByLabelText("Reorder Show c");
    grip.focus();
    fireEvent.keyDown(grip, { key: "ArrowUp" });
    expect(document.activeElement).toBe(screen.getByLabelText("Reorder Show c"));
  });

  it("refuses a second move while the first is still saving", async () => {
    await renderEditor();
    fireEvent.keyDown(screen.getByLabelText("Reorder Show c"), { key: "ArrowUp" });
    // Same tick, before any re-render: refused by the in-flight count.
    fireEvent.keyDown(screen.getByLabelText("Reorder Show c"), { key: "ArrowUp" });
    fireEvent.keyDown(screen.getByLabelText("Reorder Show d"), { key: "ArrowUp" });
    expect(writes()).toHaveLength(1);
    await waitFor(() =>
      expect(screen.getByLabelText("Reorder Show c")).toHaveAttribute("aria-disabled", "true")
    );

    await land();
    expect(screen.getByLabelText("Reorder Show c")).toHaveAttribute("aria-disabled", "false");
    fireEvent.keyDown(screen.getByLabelText("Reorder Show c"), { key: "ArrowUp" });
    expect(writes()).toHaveLength(2);
    expect(writes()[1].body.item_ids).toEqual(["c", "a", "b", "d"]);
  });

  it("refuses a typed position while a save is in flight, and resets the box", async () => {
    await renderEditor();
    fireEvent.keyDown(screen.getByLabelText("Reorder Show c"), { key: "ArrowUp" });
    expect(writes()).toHaveLength(1);

    const box = screen.getByLabelText("Position, currently 4 of 4");
    fireEvent.change(box, { target: { value: "1" } });
    fireEvent.blur(box);
    expect(writes()).toHaveLength(1);
    expect(box).toHaveValue(4);
  });

  it("moves a typed step to its slot when nothing is saving", async () => {
    await renderEditor();
    const box = screen.getByLabelText("Position, currently 4 of 4");
    fireEvent.change(box, { target: { value: "1" } });
    fireEvent.blur(box);
    expect(writes()).toHaveLength(1);
    expect(writes()[0].body.item_ids).toEqual(["d", "a", "b", "c"]);
  });

  it("moves a whole part in ONE request, parts and steps together", async () => {
    await renderEditor();
    fireEvent.keyDown(screen.getByLabelText("Reorder part Part Two"), { key: "ArrowUp" });
    expect(writes()).toHaveLength(1);
    const [write] = writes();
    expect(write.method).toBe("PUT");
    expect(write.url).toBe("/api/watch-order/lists/list-1/reorder");
    expect(write.body.item_ids).toEqual(["a", "b", "d", "c"]);
    expect(write.body.section_ids).toEqual(["p1", "p1", "p2", null]);
    expect(write.body.section_positions).toEqual([
      { section_id: "p1", position: 1 },
      { section_id: "p2", position: 3 },
    ]);
    await land();
    expect(stepNames()).toEqual(["a", "b", "d", "c"]);
  });

  it("moves an empty part with no PATCH, in the same single request", async () => {
    server.sections.push({ system_id: "p3", section_name: "Part Three", position: 2.5 });
    await renderEditor();
    // Drawn between B and C; one place up puts it above Part One.
    fireEvent.keyDown(screen.getByLabelText("Reorder part Part Three"), { key: "ArrowUp" });
    expect(writes()).toHaveLength(1);
    expect(writes()[0].method).toBe("PUT");
    const positions = Object.fromEntries(
      writes()[0].body.section_positions.map((s) => [s.section_id, s.position])
    );
    expect(positions.p3).toBeLessThan(1);
    expect(writes()[0].body.item_ids).toEqual(["a", "b", "c", "d"]);
  });

  it("puts the order back and says so when the save fails", async () => {
    await renderEditor();
    fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        statusText: "Bad Request",
        json: () => Promise.resolve({ detail: "nope" }),
      })
    );
    fireEvent.keyDown(screen.getByLabelText("Reorder Show c"), { key: "ArrowUp" });
    await waitFor(() => expect(showToast).toHaveBeenCalledWith("error", "nope"));
    await waitFor(() => expect(stepNames()).toEqual(["a", "b", "c", "d"]));
  });
});
