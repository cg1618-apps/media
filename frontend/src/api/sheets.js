// Frontend: run a sheet pipeline - Backup or Pull - and report how it ended.
//
// Both stream one `processing` event per sheet tab and end with one final
// event: `success` or `error` (a single-tab Pull may also end `skipped`). They
// run on the server independently of this request, so a stream that ends
// without a final event (the page's connection dropped) does NOT mean the run
// failed - only that this page stopped hearing about it.
import { postEventStream } from "./client";
import { endpoints } from "./endpoints";

export const BACKUP_LOST_MESSAGE =
  "Lost contact with the backup. It keeps running on the server; its result will appear in the Data Control log.";
export const PULL_LOST_MESSAGE =
  "Lost contact with the pull. It keeps running on the server; its result will appear in the Data Control log.";

// Resolves to { status, message, result } where status is the final event's
// ("success", "error", "skipped"), "busy" (another run holds the sheet - 409)
// or "lost" (see above). `result` is the final event itself, so a Pull's
// counts and lists stay available to the caller.
async function runSheetStream(url, lostMessage, onProgress) {
  let outcome = null;
  try {
    await postEventStream(url, (event) => {
      if (event.status === "processing") onProgress?.(event);
      else outcome = { status: event.status, message: event.message, result: event };
    });
  } catch (e) {
    if (e.status === 409) return { status: "busy", message: e.message };
    // A refusal before the stream began (400, 401, 500) is a real failure; a
    // break after it began is the "lost" case below.
    if (e.status) return { status: "error", message: e.message };
    if (outcome) return outcome;
    return { status: "lost", message: lostMessage };
  }
  return outcome ?? { status: "lost", message: lostMessage };
}

export function runBackup({ onProgress } = {}) {
  return runSheetStream(endpoints.dataControl.backup(), BACKUP_LOST_MESSAGE, onProgress);
}

// Pull All, or the one sheet tab named by `tab`.
export function runPull({ tab, onProgress } = {}) {
  const url = tab ? endpoints.dataControl.pull(tab) : endpoints.dataControl.pullAll();
  return runSheetStream(url, PULL_LOST_MESSAGE, onProgress);
}

// The toast each outcome shows: "busy", "lost" and "skipped" are not failures.
const TOAST_TYPE = {
  success: "success",
  error: "error",
  busy: "warning",
  lost: "warning",
  skipped: "warning",
};

function sheetToast(failed, succeeded, { status, message }) {
  if (status === "error") return ["error", `${failed}: ${message}`];
  return [TOAST_TYPE[status] ?? "error", message ?? succeeded];
}

export const backupToast = (outcome) => sheetToast("Backup failed", "Backup complete.", outcome);
export const pullToast = (outcome) => sheetToast("Pull failed", "Pull complete.", outcome);
