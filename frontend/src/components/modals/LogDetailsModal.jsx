// Frontend: modal component file for LogDetailsModal.
//
// The Control Center's Data Control Log opens this from a row's Details
// button. It reads the row back with its operations (GET
// /api/system/logs/{id}) and lists each one's trigger, time and status: the
// tabs of a Pull All, the types of a Fill All or Replace All and the Backup
// that ends it. A row that ran no operations of its own lists itself, so the
// popup reads the same for every row. A failed row prints its error beneath
// it. Same chrome as ConfirmModal; Escape closes, as Close does.
import { useEffect } from "react";

import { endpoints } from "../../api/endpoints";
import { useApiQuery } from "../../hooks/useApiQuery";
import { formatLogTime } from "../../lib/formatters";
import { Button, sectionTitleCls } from "../ui/primitives";

const STATUS = {
  Success: { cls: "text-success", icon: "fa-check-circle" },
  Aborted: { cls: "text-warning", icon: "fa-exclamation-triangle" },
};
const FAILED = { cls: "text-danger", icon: "fa-times-circle" };

// A log row's outcome. Anything that is neither Success nor Aborted reads as
// Failed, with the error as its tooltip.
export function LogStatus({ log }) {
  const known = STATUS[log.status];
  const { cls, icon } = known ?? FAILED;
  return (
    <span
      className={`${cls} font-bold whitespace-nowrap`}
      title={known ? undefined : log.error_message || "Unknown error"}
    >
      <i className={`fas ${icon} mr-1`}></i>
      {known ? log.status : "Failed"}
    </span>
  );
}

// Who started the row: Manual (a button) or Auto (the nightly job, or the
// Backup a Fill All ends in).
export function LogTrigger({ log }) {
  const cls =
    log.type === "Auto" ? "bg-surface-2 text-text-muted" : "bg-brand-soft text-brand";
  return (
    <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${cls}`}>
      {log.type || "Manual"}
    </span>
  );
}

export default function LogDetailsModal({ log, onClose }) {
  const query = useApiQuery(["system-log", log.id], endpoints.system.log(log.id));
  const detail = query.data;
  const operations = detail ? (detail.children.length ? detail.children : [detail]) : [];

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="log-details-modal-title"
        className="bg-surface border border-border shadow-xl max-w-2xl w-full mx-4 max-h-[85vh] flex flex-col overflow-hidden"
      >
        <div className="px-6 py-3 border-b border-border">
          <h3 id="log-details-modal-title" className={sectionTitleCls}>
            {log.action_specific || log.action_main || "Log entry"}
          </h3>
        </div>
        <div className="px-6 py-5 text-sm text-text-muted overflow-y-auto">
          {query.isLoading ? (
            <p className="text-text-faint">Loading…</p>
          ) : query.isError ? (
            <p className="text-danger">{query.error.message}</p>
          ) : (
            <table className="w-full text-left">
              <thead className="text-[10px] font-black text-text-faint border-b border-border">
                <tr>
                  <th className="py-2 pr-4">Operation</th>
                  <th className="py-2 pr-4">Trigger</th>
                  <th className="py-2 pr-4">Time</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {operations.map((op) => (
                  <tr key={op.id} className="align-top">
                    <td className="py-2 pr-4">
                      <div className="font-bold text-text">{op.action_specific}</div>
                      {op.error_message && (
                        <div className="text-[11px] text-danger break-words">
                          {op.error_message}
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <LogTrigger log={op} />
                    </td>
                    <td className="py-2 pr-4 text-text-faint whitespace-nowrap">
                      {formatLogTime(op.timestamp)}
                    </td>
                    <td className="py-2">
                      <LogStatus log={op} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-6 py-3 border-t border-border flex justify-end">
          <Button onClick={onClose} autoFocus>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
