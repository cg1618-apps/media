// Frontend: test for the route guard.
//
// Plan, Seasonal and Statistics are per-user pages from Step 3 on and their
// APIs answer 401 to a stranger. The guard is what turns that into a login
// redirect instead of a screen full of errors.
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import ProtectedRoute from "./ProtectedRoute";

const mockAuth = vi.fn();
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => mockAuth(),
}));

function renderAt(path, auth) {
  mockAuth.mockReturnValue(auth);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<ProtectedRoute requireAuth />}>
          <Route path="/plan" element={<div>the plan page</div>} />
        </Route>
        <Route path="/login" element={<div>the login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute requireAuth", () => {
  it("sends a logged-out visitor to login", () => {
    renderAt("/plan", { username: null, has: () => false, loading: false });
    expect(screen.getByText("the login page")).toBeInTheDocument();
  });

  it("lets a logged-in non-admin through", () => {
    renderAt("/plan", { username: "kana", has: () => false, loading: false });
    expect(screen.getByText("the plan page")).toBeInTheDocument();
  });

  it("gates on the permission prop when requireAuth is absent, both directions", () => {
    function renderPipelines(has) {
      mockAuth.mockReturnValue({ username: "kana", has, loading: false });
      return render(
        <MemoryRouter initialEntries={["/system"]}>
          <Routes>
            <Route element={<ProtectedRoute permission="manage.pipelines" />}>
              <Route path="/system" element={<div>the pipelines page</div>} />
            </Route>
            <Route path="/login" element={<div>the login page</div>} />
          </Routes>
        </MemoryRouter>,
      );
    }

    // Denied: a viewer who does not hold manage.pipelines is bounced to login,
    // even though they hold some other, unrelated permission.
    const { unmount } = renderPipelines((p) => p === "manage.catalog");
    expect(screen.getByText("the login page")).toBeInTheDocument();
    unmount();

    // Allowed: a viewer who holds manage.pipelines reaches the route.
    renderPipelines((p) => p === "manage.pipelines");
    expect(screen.getByText("the pipelines page")).toBeInTheDocument();
  });
});

describe("ProtectedRoute gatedType", () => {
  function renderGated(auth) {
    mockAuth.mockReturnValue({ has: () => false, loading: false, ...auth });
    return render(
      <MemoryRouter initialEntries={["/library/h-comic"]}>
        <Routes>
          <Route element={<ProtectedRoute gatedType="h-comic" />}>
            <Route path="/library/h-comic" element={<div>the h-comic library</div>} />
          </Route>
          <Route path="/" element={<div>the home page</div>} />
          <Route path="/login" element={<div>the login page</div>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("lets through a session the server named the type for", () => {
    renderGated({ username: "cg1618", visibleGatedTypes: ["h-comic"] });
    expect(screen.getByText("the h-comic library")).toBeInTheDocument();
  });

  it("sends a signed-in narrow session home, as for an unknown path", () => {
    renderGated({ username: "cg1618", visibleGatedTypes: [] });
    expect(screen.getByText("the home page")).toBeInTheDocument();
    expect(screen.queryByText("the h-comic library")).not.toBeInTheDocument();
  });

  it("sends a signed-out visitor to login", () => {
    renderGated({ username: null, visibleGatedTypes: [] });
    expect(screen.getByText("the login page")).toBeInTheDocument();
  });
});

describe("ProtectedRoute gatedType h-game", () => {
  function renderHGame(auth) {
    mockAuth.mockReturnValue({ has: () => false, loading: false, ...auth });
    return render(
      <MemoryRouter initialEntries={["/h-game/7/some-title"]}>
        <Routes>
          <Route element={<ProtectedRoute gatedType="h-game" />}>
            <Route path="/h-game/:publicId/:slug?" element={<div>the h-game page</div>} />
          </Route>
          <Route path="/" element={<div>the home page</div>} />
          <Route path="/login" element={<div>the login page</div>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("lets through a session the server named h-game for", () => {
    renderHGame({ username: "cg1618", visibleGatedTypes: ["h-comic", "h-game"] });
    expect(screen.getByText("the h-game page")).toBeInTheDocument();
  });

  it("sends home a session that sees h-comic but not h-game", () => {
    // The mirror case of the one above, with the gated list non-empty: the
    // guard refuses because h-game is missing, not because the list is.
    renderHGame({ username: "cg1618", visibleGatedTypes: ["h-comic"] });
    expect(screen.getByText("the home page")).toBeInTheDocument();
    expect(screen.queryByText("the h-game page")).not.toBeInTheDocument();
  });

  it("sends a signed-out visitor to login", () => {
    renderHGame({ username: null, visibleGatedTypes: [] });
    expect(screen.getByText("the login page")).toBeInTheDocument();
  });
});
