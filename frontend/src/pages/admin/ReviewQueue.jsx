// Frontend: the review queue - checks that each list something to look at.
//
// Every block loads on demand from one GET under /api/data-control/check/,
// and none of them changes data except where a row carries its own action.
// The blocks share their shell (components/review/ReviewBlock.jsx); the
// Remarks and Duplicates views are shared with the Control Center's modals.
import { useCallback, useState } from "react";
import { Link } from "react-router-dom";

import { endpoints } from "../../api/endpoints";
import { fetchJson } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";
import ReviewBlock from "../../components/review/ReviewBlock";
import RemarksView, {
  countRemarks,
  remarkSummary,
} from "../../components/review/RemarksView";
import DuplicatesView, {
  countDuplicates,
  duplicateSummary,
} from "../../components/review/DuplicatesView";

/** One check's state: its last answer, whether it is loading, its error. */
export function useCheck(url) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResults(await fetchJson(url));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [url]);

  return { results, loading, error, load };
}

export default function ReviewQueue() {
  const auth = useAuth();
  const remarks = useCheck(endpoints.dataControl.checkRemarks());
  const duplicates = useCheck(endpoints.dataControl.checkDuplicates());

  return (
    <div className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-text tracking-tight">
            Review Queue
          </h1>
          <p className="text-sm text-text-faint mt-1">
            Entries with your remarks and potential duplicates that may need
            attention.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/system"
            className="bg-surface border border-border-strong text-text-muted px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-surface-2 hover:text-text hover:border-border-strong transition shadow-sm flex items-center"
          >
            Control Center
          </Link>
        </div>
      </div>

      <ReviewBlock
        title="Entries With Remarks"
        loadLabel="Find remarks"
        loaded={remarks.results !== null}
        loading={remarks.loading}
        error={remarks.error}
        total={countRemarks(remarks.results, auth)}
        summary={remarkSummary}
        emptyText="No remarks found."
        onRefresh={remarks.load}
      >
        <RemarksView results={remarks.results} />
      </ReviewBlock>

      <ReviewBlock
        title="Potential Duplicates"
        loadLabel="Find duplicates"
        loaded={duplicates.results !== null}
        loading={duplicates.loading}
        error={duplicates.error}
        total={countDuplicates(duplicates.results, auth)}
        summary={duplicateSummary}
        emptyText="No duplicates found."
        onRefresh={duplicates.load}
      >
        <DuplicatesView results={duplicates.results} />
      </ReviewBlock>
    </div>
  );
}
