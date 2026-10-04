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
import MusicView, { musicSummary } from "../../components/review/MusicView";
import RelationView, {
  aloneSummary,
  countAloneGroups,
} from "../../components/review/RelationView";

/**
 * One check's state: its last answer, whether it is loading, its error.
 * `setResults` lets a block drop a row it has acted on without a reload.
 */
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

  return { results, setResults, loading, error, load };
}

export default function ReviewQueue() {
  const auth = useAuth();
  const remarks = useCheck(endpoints.dataControl.checkRemarks());
  const duplicates = useCheck(endpoints.dataControl.checkDuplicates());
  const music = useCheck(endpoints.dataControl.checkMusic());
  const alone = useCheck(endpoints.dataControl.checkAloneGroups());

  const dropAloneGroup = (kind, systemId) =>
    alone.setResults((prev) => ({
      ...prev,
      [kind]: prev[kind].filter((g) => g.system_id !== systemId),
    }));

  return (
    <div className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-text tracking-tight">
            Review Queue
          </h1>
          <p className="text-sm text-text-faint mt-1">
            Remarks, duplicates, music and single-entry groups that may need
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

      <ReviewBlock
        title="Music To Track"
        loadLabel="Find music"
        loaded={music.results !== null}
        loading={music.loading}
        error={music.error}
        total={music.results?.length ?? 0}
        summary={musicSummary}
        emptyText="No anime has music waiting."
        onRefresh={music.load}
      >
        <MusicView results={music.results} />
      </ReviewBlock>

      <ReviewBlock
        title="Single-Entry Groups"
        loadLabel="Find single-entry groups"
        loaded={alone.results !== null}
        loading={alone.loading}
        error={alone.error}
        total={countAloneGroups(alone.results, auth)}
        summary={aloneSummary}
        emptyText="No franchise or series is waiting with a single entry."
        onRefresh={alone.load}
      >
        <RelationView results={alone.results} onReviewed={dropAloneGroup} />
      </ReviewBlock>
    </div>
  );
}
