// Frontend: what waits for a handler - pending registrations and open
// requests and reports - as a few words each, linking to where each is
// handled. `GET /api/dashboard/summary` is manage.requests, so the caller
// mounts this only for a viewer holding it.
//
// On a member's dashboard (super) it is a prompt, and draws nothing at all
// when nothing waits. The admin's page passes `alwaysShow`, so its first
// section says "nothing waits" rather than vanishing.
//
// Open requests are handled in the inbox (/request-inbox, manage.requests).
// Registrations are approved in the Pending registrations panel on /system,
// which is admin.authz; a viewer without it is told who approves them
// instead of being sent to a page that would not show the panel.
import { Link } from "react-router-dom";

import { endpoints } from "../../api/endpoints";
import { useAuth } from "../../contexts/AuthContext";
import { useApiQuery } from "../../hooks/useApiQuery";
import { Slip } from "../ui/primitives";

export const DASHBOARD_SUMMARY_QUERY_KEY = ["dashboard", "summary"];

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

const LINK_CLS = "text-text hover:text-brand underline-offset-2 hover:underline";

export default function DashboardSummary({ alwaysShow = false }) {
  const { has } = useAuth();
  const query = useApiQuery(DASHBOARD_SUMMARY_QUERY_KEY, endpoints.dashboard.summary());

  if (query.isLoading) {
    return alwaysShow ? (
      <Slip title="Waiting">
        <p className="text-sm text-text-faint">Loading…</p>
      </Slip>
    ) : null;
  }
  if (query.isError) {
    return (
      <Slip title="Waiting">
        <p className="text-sm text-danger">{query.error.message}</p>
      </Slip>
    );
  }

  const pending = query.data?.pending_registrations ?? 0;
  const open = query.data?.open_requests ?? 0;
  if (pending === 0 && open === 0 && !alwaysShow) return null;

  const registrations = plural(pending, "registration", "registrations");
  return (
    <Slip title="Waiting" data-testid="dashboard-summary">
      {pending === 0 && open === 0 ? (
        <p className="text-sm text-text-faint">Nothing waits.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {pending > 0 && (
            <li>
              {has("admin.authz") ? (
                <Link to="/system" className={LINK_CLS}>
                  {registrations} to approve
                </Link>
              ) : (
                <span className="text-text">
                  {registrations} waiting for the admin to approve
                </span>
              )}
            </li>
          )}
          {open > 0 && (
            <li>
              <Link to="/request-inbox" className={LINK_CLS}>
                {plural(open, "open request or report", "open requests and reports")}
              </Link>
            </li>
          )}
        </ul>
      )}
    </Slip>
  );
}
