// Frontend: the seasonal detail page's admin buttons that act on the whole
// season at once.
//
// "Autofill & update" runs the anime detail page's own Autofill & update -
// the single-entry Replace, POST /api/data-control/replace/anime/{id} - for
// every anime in the season that has a MAL link, one request at a time so
// Tenrai is not hit in parallel. "Mark finished airing" PATCHes every anime
// still Airing or Not Yet Aired to Finished Airing, and is not shown when
// none is. Both confirm first, and both call `onDone` so the page reloads.
import { useState } from "react";

import { endpoints } from "../../api/endpoints";
import { useToast } from "../../hooks/useToast";
import { getDisplayName } from "../../lib/naming";
import ConfirmModal from "../modals/ConfirmModal";
import { Button } from "../ui/primitives";

const UNFINISHED_AIRING = ["Airing", "Not Yet Aired"];

export function finishableAnime(anime) {
  return anime.filter((a) => UNFINISHED_AIRING.includes(a.airing_status));
}

function autofillableAnime(anime) {
  return anime.filter((a) => a.mal_link);
}

// Runs `request` for each entry in turn, reporting progress, and answers with
// the entries that failed and why.
async function runEach(entries, request, onProgress) {
  const failed = [];
  for (const [i, entry] of entries.entries()) {
    onProgress(i + 1);
    try {
      const res = await request(entry);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        failed.push({ entry, reason: data.detail || `HTTP ${res.status}` });
      }
    } catch {
      failed.push({ entry, reason: "network error" });
    }
  }
  return failed;
}

function failureList(failed) {
  return failed
    .map(({ entry, reason }) => `${getDisplayName(entry, "anime")} (${reason})`)
    .join(", ");
}

const ACTIONS = {
  finish: {
    pick: finishableAnime,
    title: "Mark finished airing",
    confirm: (n) => `Mark ${n} finished`,
    body: (n) =>
      `Set ${n} anime that are Airing or Not Yet Aired to Finished Airing?`,
    busy: (i, n) => `Marking ${i}/${n}…`,
    request: (a) =>
      fetch(endpoints.resource("anime").patch(a.system_id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ airing_status: "Finished Airing" }),
        credentials: "include",
      }),
    done: (ok, n) =>
      ok === n ? `Marked ${n} as finished airing` : `Marked ${ok} of ${n} as finished airing`,
  },
  autofill: {
    pick: autofillableAnime,
    title: "Autofill & update",
    confirm: (n) => `Autofill ${n}`,
    body: (n, skipped) =>
      `Fill and update ${n} anime from MyAnimeList, one at a time?` +
      (skipped ? ` ${skipped} without a MAL link will be skipped.` : ""),
    busy: (i, n) => `Autofilling ${i}/${n}…`,
    request: (a) =>
      fetch(endpoints.dataControl.replaceSingle("anime", a.system_id), {
        method: "POST",
        credentials: "include",
      }),
    done: (ok, n) => `Autofilled ${ok} of ${n}`,
  },
};

export default function SeasonBulkActions({ anime, onDone }) {
  const { showToast } = useToast();
  const [confirming, setConfirming] = useState(null);
  const [running, setRunning] = useState(null);
  const [progress, setProgress] = useState(0);

  const finishable = finishableAnime(anime);
  const autofillable = autofillableAnime(anime);

  async function run(key) {
    const action = ACTIONS[key];
    const entries = action.pick(anime);
    setConfirming(null);
    setRunning(key);
    const failed = await runEach(entries, action.request, setProgress);
    setRunning(null);
    setProgress(0);
    const message = action.done(entries.length - failed.length, entries.length);
    if (failed.length) showToast("error", `${message} · failed: ${failureList(failed)}`);
    else showToast("success", message);
    onDone();
  }

  const label = (key, idle) =>
    running === key ? ACTIONS[key].busy(progress, ACTIONS[key].pick(anime).length) : idle;

  const pending = confirming && ACTIONS[confirming];
  const pendingCount = pending ? pending.pick(anime).length : 0;

  return (
    <div className="flex flex-wrap gap-2">
      {finishable.length > 0 && (
        <Button onClick={() => setConfirming("finish")} disabled={running !== null}>
          {label("finish", `Mark finished airing (${finishable.length})`)}
        </Button>
      )}
      {autofillable.length > 0 && (
        <Button
          kind="primary"
          onClick={() => setConfirming("autofill")}
          disabled={running !== null}
        >
          {label("autofill", "Autofill & update")}
        </Button>
      )}
      {pending && (
        <ConfirmModal
          title={pending.title}
          confirmLabel={pending.confirm(pendingCount)}
          onConfirm={() => run(confirming)}
          onCancel={() => setConfirming(null)}
        >
          {pending.body(pendingCount, anime.length - pendingCount)}
        </ConfirmModal>
      )}
    </div>
  );
}
