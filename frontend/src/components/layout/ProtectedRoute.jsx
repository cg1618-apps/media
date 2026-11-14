// Frontend: layout component file for ProtectedRoute.
//
// Guards a route on one permission. With none of the options below, the
// route is open: a bare <Route element={<ProtectedRoute />}> lets everyone
// through, so a page that needs a capability names the permission it needs.
//
// `requireAuth` asks the weaker question instead - "is anyone logged in?" -
// mirroring the server's get_current_user_id. The per-user pages (Plan,
// Seasonal, Statistics) need an account, not a role.
//
// `anyPermission` takes a list and passes a viewer holding ANY one of them -
// for a page two capabilities read for different reasons, as the label
// reference is read by admin.authz (to see what a mode shows) and by
// manage.catalog (the one attaching labels). It mirrors a server dependency
// that spells the same disjunction out, rather than picking the wider key.
//
// `gatedType` asks the third question - "may this session see this gated
// media type?" - through canSeeGatedType, the same helper navigation.js asks
// for the nav row, so the route and its link cannot disagree. A session that
// may not see the type is not told it exists: a signed-in one lands on the
// home page as if the path were unknown, and only a signed-out visitor is sent
// to log in, since signing in may bring a mode that carries the label. It
// composes with `permission`/`requireAuth` only when one is passed explicitly;
// on its own it asks nothing else.
//
// `feature` asks the fourth - "does this ACCOUNT have this feature switched
// on?" - through hasFeature, the same question navigation.js's `feature` rows
// ask. It replaces `permission` rather than composing with it.
//
// This is a redirect, not a security boundary: the API refuses the request on
// its own. The point is to send someone to the login page instead of showing
// them a screen that will only fill with errors.
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { canSeeGatedType } from "../../lib/gatedTypes";

export default function ProtectedRoute({
  permission,
  anyPermission,
  requireAuth = false,
  gatedType,
  feature,
}) {
  const auth = useAuth();
  const { has, hasFeature, username, loading } = auth;
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
          <p className="text-text-faint font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (gatedType && !canSeeGatedType(auth, gatedType)) {
    return username ? (
      <Navigate to="/" replace />
    ) : (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  }

  // requireAuth gates on "is anyone logged in" rather than on a permission.
  // With none of the options, the route is open.
  const allowed = feature
    ? hasFeature(feature)
    : requireAuth
    ? Boolean(username)
    : permission
      ? has(permission)
      : anyPermission
        ? anyPermission.some((p) => has(p))
        : true;

  // Without it, send them to login and preserve the page they wanted.
  return allowed ? (
    <Outlet />
  ) : (
    <Navigate
      to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
      replace
    />
  );
}
