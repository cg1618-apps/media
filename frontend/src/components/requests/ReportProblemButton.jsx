// Frontend: "Report a problem" - files a request about the page it sits on.
//
// One component for every entry, group and entity page, so where it sits is
// decided by its call sites and what it does is decided here. Its placement
// - the right-hand end of the breadcrumb row, the one header row every viewer
// sees (the dashed admin strip is manage.catalog only, so a `user` never
// sees it) - is provisional, pending the owner's design.
//
// Drawn only for a viewer holding self.requests: user, super and the shared
// accounts. Never the guest, and never the admin account, which files
// nothing (its role holds no self.* key).
import { useState } from "react";
import { useLocation } from "react-router-dom";

import { useAuth } from "../../contexts/AuthContext";
import RequestModal from "../modals/RequestModal";

export default function ReportProblemButton({ targetType, targetId, targetLabel }) {
  const auth = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  // Outside an AuthProvider nobody is known to hold anything.
  const canFile = Boolean(auth?.has?.("self.requests"));
  if (!canFile || !targetId) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint hover:text-brand transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        Report a problem
      </button>
      {open && (
        <RequestModal
          target={{ type: targetType, id: targetId, label: targetLabel }}
          pagePath={location.pathname}
          defaultKind="data_error"
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
