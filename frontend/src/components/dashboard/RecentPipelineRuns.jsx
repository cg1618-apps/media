// Frontend: the latest pipeline runs (Backup, Pull, Fill, Replace,
// Calculate), from the data control log `GET /api/system/logs`
// (manage.pipelines). The caller mounts it only for a viewer holding that
// key. The full log, with its metrics and clearing, is on /system.
import { Link } from "react-router-dom";

import { endpoints } from "../../api/endpoints";
import { useApiQuery } from "../../hooks/useApiQuery";
import { Slip } from "../ui/primitives";

export const RECENT_RUNS_LIMIT = 5;

const STATUS_CLS = {
  Success: "text-success",
  Aborted: "text-warning",
};

function formatDate(dateStr) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function RecentPipelineRuns({ limit = RECENT_RUNS_LIMIT }) {
  const query = useApiQuery(["system-logs"], endpoints.system.logs(), {
    params: { limit },
  });
  const runs = query.data ?? [];

  return (
    <Slip
      title="Recent pipeline runs"
      actions={
        <Link to="/system" className="text-xs text-text-muted hover:text-brand">
          Full log
        </Link>
      }
      padded={false}
    >
      {query.isLoading ? (
        <p className="p-4 text-sm text-text-faint">Loading…</p>
      ) : query.isError ? (
        <p className="p-4 text-sm text-danger">{query.error.message}</p>
      ) : runs.length === 0 ? (
        <p className="p-4 text-sm text-text-faint">No pipeline has run yet.</p>
      ) : (
        <ul className="divide-y divide-border" data-testid="pipeline-runs">
          {runs.map((run) => (
            <li key={run.id} className="px-4 py-2.5 flex items-baseline gap-3 text-sm">
              <span className="flex-1 min-w-0">
                <span className="text-text">{run.action_main || "Unknown"}</span>
                {run.action_specific && (
                  <span className="text-text-faint"> · {run.action_specific}</span>
                )}
              </span>
              <span
                className={`font-mono text-[11px] uppercase tracking-[0.12em] ${
                  STATUS_CLS[run.status] ?? "text-danger"
                }`}
                title={run.error_message || undefined}
              >
                {run.status}
              </span>
              <span className="font-mono text-[11px] text-text-faint whitespace-nowrap">
                {formatDate(run.timestamp)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Slip>
  );
}
