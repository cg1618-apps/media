// Frontend: the Control Center's Calculate & Fix box.
//
// Pins the Sync Cast button: it posts to Calculate All's cast step on its own
// and shows the server's message as its toast, like the Calculate All button
// beside it. And Remove Uncast Characters: the list opens all ticked, and the
// remove call names only what is still ticked.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Admin from "./Admin";

const showToast = vi.fn();
vi.mock("../../hooks/useToast", () => ({ useToast: () => ({ showToast }) }));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ has: () => true, visibleGatedTypes: [] }),
}));

const SYNC_CAST = "/api/data-control/calculate/sync-cast";
const UNCAST_SCAN = "/api/data-control/check/uncast-characters";
const UNCAST_REMOVE = "/api/data-control/calculate/remove-uncast-characters";

let fetchMock;

beforeEach(() => {
  showToast.mockReset();
  fetchMock = vi.fn(async (url) => {
    if (url === SYNC_CAST) {
      return {
        ok: true,
        json: async () => ({
          status: "success",
          message: "Cast synced: 2 character/identity field(s) and 3 cast field(s) filled.",
          counts: {},
        }),
      };
    }
    if (url === UNCAST_SCAN) {
      return {
        ok: true,
        json: async () => ({
          status: "success",
          count: 2,
          characters: [
            { system_id: "a", public_id: 1, name: "Asuna", identity_count: 0, has_photo: true },
            { system_id: "b", public_id: 2, name: "Kirito", identity_count: 2, has_photo: false },
          ],
        }),
      };
    }
    if (url === UNCAST_REMOVE) {
      return {
        ok: true,
        json: async () => ({ status: "success", message: "Removed 1 uncast character." }),
      };
    }
    // Everything the page loads on mount: season, logs, announcements, rates.
    return { ok: true, json: async () => [] };
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Control Center Sync Cast", () => {
  it("posts to the cast sync and toasts its message", async () => {
    render(
      <MemoryRouter>
        <Admin />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Sync Cast/ }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        "success",
        "Cast synced: 2 character/identity field(s) and 3 cast field(s) filled.",
      ),
    );
    const call = fetchMock.mock.calls.find(([url]) => url === SYNC_CAST);
    expect(call[1]).toMatchObject({ method: "POST", credentials: "include" });
  });

  it("says it never overwrites", async () => {
    render(
      <MemoryRouter>
        <Admin />
      </MemoryRouter>,
    );
    expect(
      await screen.findByText(/Fill empty cast and character fields from each other/),
    ).toBeInTheDocument();
    // Let the mount-time loads settle inside the test.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });
});

describe("Control Center Remove Uncast Characters", () => {
  it("removes only the characters left ticked", async () => {
    render(
      <MemoryRouter>
        <Admin />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Remove Uncast Characters/ }));
    const keep = await screen.findByRole("checkbox", { name: "Kirito" });
    expect(screen.getByRole("checkbox", { name: "Asuna" })).toBeChecked();
    expect(screen.getByText("+2 identities")).toBeInTheDocument();

    fireEvent.click(keep);
    fireEvent.click(screen.getByRole("button", { name: "Remove Selected (1)" }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith("success", "Removed 1 uncast character."),
    );
    const call = fetchMock.mock.calls.find(([url]) => url === UNCAST_REMOVE);
    expect(call[1]).toMatchObject({ method: "POST", credentials: "include" });
    expect(JSON.parse(call[1].body)).toEqual({ system_ids: ["a"] });
  });
});
