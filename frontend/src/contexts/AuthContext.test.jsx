import { act, render, screen, waitFor } from "@testing-library/react";
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
      <span data-testid="authz">{String(has("admin.authz"))}</span>
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

  it("gives the admin exactly its fixed set, and nothing it was not granted", async () => {
    // No role short-circuits any more. The admin's /me carries its fixed set
    // and is_admin false (it holds no manage.catalog); a permission outside
    // that set - a media type, self.list, one nobody has minted - is false.
    // The set is non-empty and admin.authz answers true from it, so the
    // falses are the membership test's doing, not an empty session's.
    mockMe({
      is_admin: false,
      username: "admin",
      role: "admin",
      permissions: [
        "admin.authz",
        "manage.pipelines",
        "manage.requests",
        "manage.announcements",
        "manage.options",
        "manage.images",
        "manage.resources",
      ],
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("authz")).toHaveTextContent("true"),
    );
    expect(screen.getByTestId("admin")).toHaveTextContent("false");
    expect(screen.getByTestId("manga")).toHaveTextContent("false");
    expect(screen.getByTestId("invented")).toHaveTextContent("false");
    expect(screen.getByTestId("selflist")).toHaveTextContent("false");
  });

  it("answers self.* from the grant like any other family", async () => {
    // The mirror of the false above: self.list granted is self.list held.
    mockMe({
      is_admin: false,
      username: "friend",
      role: "user",
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
    // is_admin means manage.catalog: true for super.
    mockMe({
      is_admin: true,
      username: "cg1618",
      role: "super",
      permissions: ["manage.catalog"],
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
    mockMe({ is_admin: true, username: "cg1618", role: "super", permissions: [], visible_gated_types: ["h-comic"] });
    render(
      <AuthProvider>
        <GatedProbe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("gated")).toHaveTextContent("h-comic"));
  });

  it("is empty when the server names none - even for a catalogue editor", async () => {
    mockMe({ is_admin: true, username: "cg1618", role: "super", permissions: ["manage.catalog"], visible_gated_types: [] });
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
      username: "cg1618",
      role: "super",
      permissions: [],
      mode: { id: "m1", key: "unrestricted", expires_at: expiresAt },
      modes: [],
    });
  }

  // The clock must not move while the page signs in. The reload's delay is
  // computed when /me answers, and every assertion below is about a margin
  // measured from that moment, so any fake time that passes during the render
  // eats into it. /me is a mocked promise, so signing in needs microtasks
  // only: act() drains them without touching the clock. Neither
  // testing-library's waitFor (under `shouldAdvanceTime` the clock follows
  // real time, seconds of it on a loaded machine) nor vi.waitFor (it advances
  // the clock by each polling interval) can promise that.
  async function renderSignedIn() {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    for (let i = 0; i < 20 && !screen.queryByTestId("role")?.textContent; i++) {
      await act(async () => {});
    }
    expect(screen.getByTestId("role")).toHaveTextContent("super");
  }

  beforeEach(() => {
    hardNavigate.mockClear();
    vi.useFakeTimers();
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
