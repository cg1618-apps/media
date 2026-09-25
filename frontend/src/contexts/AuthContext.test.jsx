import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hardNavigate } from "../lib/hardNavigate";
import { AuthProvider, useAuth } from "./AuthContext";

vi.mock("../lib/hardNavigate", () => ({ hardNavigate: vi.fn() }));

function Probe() {
  const { has, isAdmin, role, loading } = useAuth();
  if (loading) return <div>loading</div>;
  return (
    <div>
      <span data-testid="role">{role}</span>
      <span data-testid="admin">{String(isAdmin)}</span>
      <span data-testid="anime">{String(has("media_type.anime"))}</span>
      <span data-testid="manga">{String(has("media_type.manga"))}</span>
      <span data-testid="invented">{String(has("label.invented"))}</span>
      <span data-testid="selflist">{String(has("self.list"))}</span>
    </div>
  );
}

function mockMe(body) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  delete global.fetch;
});

describe("useAuth().has", () => {
  it("answers true only for permissions the viewer holds", async () => {
    mockMe({
      is_admin: false,
      username: "friend",
      role: "friend",
      is_root: false,
      permissions: ["media_type.anime"],
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("anime")).toHaveTextContent("true"),
    );
    expect(screen.getByTestId("manga")).toHaveTextContent("false");
    expect(screen.getByTestId("role")).toHaveTextContent("friend");
  });

  it("gives a root role every permission, including ones nobody granted", async () => {
    // The reason a new content label never hides content from an admin.
    mockMe({
      is_admin: true,
      username: "admin",
      role: "admin",
      is_root: true,
      permissions: [],
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("invented")).toHaveTextContent("true"),
    );
    expect(screen.getByTestId("manga")).toHaveTextContent("true");
  });

  it("does not hand a root role the self family", async () => {
    // The one exception to the short-circuit above, and it mirrors
    // Viewer.has on the server: self.* is ownership, not privilege. An admin
    // account administers the site and keeps no library on it, so the nav
    // must not advertise Plan, Seasonal and Statistics to a caller the API
    // answers 401.
    mockMe({
      is_admin: true,
      username: "admin",
      role: "admin",
      is_root: true,
      permissions: [],
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("selflist")).toHaveTextContent("false"),
    );
    // The mirror on the same viewer: everything else still short-circuits,
    // so a false above is the carve-out and not a broken root flag.
    expect(screen.getByTestId("invented")).toHaveTextContent("true");
  });

  it("gives a root role the self family when it is granted explicitly", async () => {
    // Nothing about the carve-out stops a grant. It removes the IMPLICIT
    // hold, so an account that really is granted self.list keeps its library
    // whatever its role's root flag says.
    mockMe({
      is_admin: true,
      username: "admin",
      role: "admin",
      is_root: true,
      permissions: ["self.list"],
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("selflist")).toHaveTextContent("true"),
    );
  });

  it("falls back to an anonymous guest when /me fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("offline"));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("role")).toHaveTextContent("guest"),
    );
    expect(screen.getByTestId("admin")).toHaveTextContent("false");
    expect(screen.getByTestId("anime")).toHaveTextContent("false");
  });

  it("keeps isAdmin working for the components that still read it", async () => {
    mockMe({
      is_admin: true,
      username: "admin",
      role: "admin",
      is_root: true,
      permissions: [],
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("admin")).toHaveTextContent("true"),
    );
  });
});

describe("useAuth().visibleGatedTypes", () => {
  function GatedProbe() {
    const { visibleGatedTypes, loading } = useAuth();
    if (loading) return <div>loading</div>;
    return <span data-testid="gated">{visibleGatedTypes.join(",") || "none"}</span>;
  }

  it("carries the gated types /api/auth/me names", async () => {
    mockMe({ is_admin: true, username: "admin", role: "admin", is_root: true, permissions: [], visible_gated_types: ["h-comic"] });
    render(
      <AuthProvider>
        <GatedProbe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("gated")).toHaveTextContent("h-comic"));
  });

  it("is empty when the server names none - even for a root account", async () => {
    mockMe({ is_admin: true, username: "admin", role: "admin", is_root: true, permissions: [], visible_gated_types: [] });
    render(
      <AuthProvider>
        <GatedProbe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("gated")).toHaveTextContent("none"));
  });
});

describe("a switched-to access mode that expires", () => {
  // The server returns the session to the account's default mode when the
  // override ends. Everything on screen was fetched in the old mode, so the
  // page reloads just after that moment rather than keep showing it.
  function meWithMode(expiresAt) {
    mockMe({
      is_admin: true,
      username: "admin",
      role: "admin",
      is_root: true,
      permissions: [],
      mode: { id: "m1", key: "unrestricted", expires_at: expiresAt },
      modes: [],
    });
  }

  async function renderSignedIn() {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("role")).toHaveTextContent("admin"),
    );
  }

  beforeEach(() => {
    hardNavigate.mockClear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reloads the page just after the override ends", async () => {
    meWithMode(new Date(Date.now() + 60_000).toISOString());
    await renderSignedIn();

    vi.advanceTimersByTime(59_000);
    expect(hardNavigate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(3_000);
    expect(hardNavigate).toHaveBeenCalledTimes(1);
    expect(hardNavigate).toHaveBeenCalledWith(
      window.location.pathname + window.location.search,
    );
  });

  it("waits out the floor when the deadline has already passed here", async () => {
    // This device's clock is ahead of the server's: without a floor the
    // reload would find the override still live and reload again at once.
    meWithMode(new Date(Date.now() - 10_000).toISOString());
    await renderSignedIn();

    vi.advanceTimersByTime(4_000);
    expect(hardNavigate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2_000);
    expect(hardNavigate).toHaveBeenCalledTimes(1);
  });

  it("does not reload a session already in its default mode", async () => {
    meWithMode(null);
    await renderSignedIn();

    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(hardNavigate).not.toHaveBeenCalled();
  });
});
