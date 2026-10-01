// Frontend: run a Backup and report how it ended.
//
// The Backup streams one `processing` event per sheet tab and ends with
// `success` or `error`. It runs on the server independently of this request,
// so a stream that ends without either (the page's connection dropped) does
// NOT mean the Backup failed - only that this page stopped hearing about it.
import { postEventStream } from "./client";
import { endpoints } from "./endpoints";

export const BACKUP_LOST_MESSAGE =
  "Lost contact with the backup. It keeps running on the server; its result will appear in the Data Control log.";

// Resolves to { status, message } where status is "success", "error",
// "busy" (another Backup is running) or "lost" (see above).
export async function runBackup({ onProgress } = {}) {
  let outcome = null;
  try {
    await postEventStream(endpoints.dataControl.backup(), (event) => {
      if (event.status === "processing") onProgress?.(event);
      else outcome = { status: event.status, message: event.message };
    });
  } catch (e) {
    if (e.status === 409) return { status: "busy", message: e.message };
    // A refusal before the stream began (401, 500) is a real failure; a break
    // after it began is the "lost" case below.
    if (e.status) return { status: "error", message: e.message };
    if (outcome) return outcome;
    return { status: "lost", message: BACKUP_LOST_MESSAGE };
  }
  return outcome ?? { status: "lost", message: BACKUP_LOST_MESSAGE };
}

// The toast each outcome shows: neither "busy" nor "lost" is a failure.
const TOAST_TYPE = { success: "success", error: "error", busy: "warning", lost: "warning" };

export function backupToast({ status, message }) {
  const text = status === "error" ? `Backup failed: ${message}` : message;
  return [TOAST_TYPE[status] ?? "error", text];
}
