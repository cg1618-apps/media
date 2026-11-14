// Frontend: authentication context shared across the app.
//
// /api/auth/me is where the SPA learns what it may show. It carries the whole
// permission set, not just the admin flag, because a viewer can now hold some
// permissions and not others.
//
// `isAdmin` keeps its old shape (a boolean every existing consumer reads to
// enable or hide a control) but not its old meaning: it now reports whether
// the viewer holds manage.catalog, not the deleted bare admin permission. It
// is "may edit the catalogue", so it is true for super and false for the
// admin account, which holds no manage.catalog; a control that belongs to the
// administrator asks the admin's own permission with has() instead.
//
// Hiding here is cosmetic. The server already withholds what a viewer may not
// see, so this only stops the UI drawing empty frames around nothing.
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";

import { hardNavigate } from "../lib/hardNavigate";

const AuthContext = createContext(null);

// When a switched-to access mode ends, reload a moment after the server's
// deadline, and never sooner than the floor after this page loaded.
const MODE_RELOAD_GRACE_MS = 1000;
const MODE_RELOAD_FLOOR_MS = 5000;

const ANONYMOUS = {
  isAdmin: false,
  username: null,
  role: "guest",
  permissions: [],
  // The gated media types this session may see (`visible_gated_types`).
  // Only the seeable ones are named, so a narrow session's list is empty and
  // it is never told a gated type exists. Read through canSeeGatedType
  // (lib/gatedTypes.js), not directly.
  visibleGatedTypes: [],
  // The account's feature switches by name (`features`), e.g.
  // "quotes_memes". hasFeature() is a plain membership test. A guest holds
  // none.
  features: [],
  // The OBJECT axis. `mode` is the active access mode; `modes` is every mode
  // this account holds, each already carrying `requires_password` - the
  // server computes that subset test so the SPA never models it. A guest
  // holds none.
  mode: null,
  modes: [],
  loading: false,
};

export function AuthProvider({ children }) {
  // Store the current auth snapshot once so any component can read it.
  const [auth, setAuth] = useState({ ...ANONYMOUS, loading: true });

  // Ask the backend who the current user is. This runs on app startup and on demand.
  const fetchAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setAuth({
          isAdmin: data.is_admin,
          username: data.username,
          role: data.role ?? "guest",
          permissions: data.permissions ?? [],
          visibleGatedTypes: data.visible_gated_types ?? [],
          features: data.features ?? [],
          mode: data.mode ?? null,
          modes: data.modes ?? [],
          loading: false,
        });
      } else {
        setAuth({ ...ANONYMOUS });
      }
    } catch {
      setAuth({ ...ANONYMOUS });
    }
  }, []);

  useEffect(() => {
    // Populate auth state as soon as the provider mounts.
    fetchAuth();
  }, [fetchAuth]);

  // A switched-to access mode is temporary: at `expires_at` the server puts
  // the session back in the account's default mode. Everything on screen was
  // fetched in the old mode, so reload at that moment - the same full load a
  // switch takes, for the same reason (lib/hardNavigate.js).
  //
  // The floor matters when this device's clock runs ahead of the server's:
  // the reload lands while the server still counts the override as live, /me
  // hands back the same expires_at, and without a floor the page would
  // reload in a tight loop until the clocks agree.
  const modeExpiresAt = auth.mode?.expires_at ?? null;
  useEffect(() => {
    if (!modeExpiresAt) return undefined;
    const delay = Math.max(
      MODE_RELOAD_FLOOR_MS,
      Date.parse(modeExpiresAt) - Date.now() + MODE_RELOAD_GRACE_MS,
    );
    const timer = setTimeout(
      () => hardNavigate(window.location.pathname + window.location.search),
      delay,
    );
    return () => clearTimeout(timer);
  }, [modeExpiresAt]);

  // A Set so has() stays O(1) on pages that ask about many permissions.
  const held = useMemo(() => new Set(auth.permissions), [auth.permissions]);

  // Mirrors Viewer.has on the server: a plain membership test, for every
  // role. No role short-circuits - the admin holds exactly its fixed set.
  const has = useCallback((permission) => held.has(permission), [held]);

  // A feature is a switch on the ACCOUNT, not a permission on its role, so it
  // is its own question, answered by /me's `features`
  // (services/rbac/features.py).
  const hasFeature = useCallback(
    (feature) => auth.features.includes(feature),
    [auth.features],
  );

  const value = useMemo(
    () => ({ ...auth, has, hasFeature, refetchAuth: fetchAuth }),
    [auth, has, hasFeature, fetchAuth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  // Convenience hook so components do not import useContext directly.
  return useContext(AuthContext);
}
