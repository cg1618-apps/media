// runBackup turns the Backup's event stream into one outcome. The cases that
// matter are the ones where the page and the server disagree: a refusal
// (another Backup running), and a stream that stops before the Backup does.
import { afterEach, describe, expect, it, vi } from "vitest";
import { BACKUP_LOST_MESSAGE, runBackup } from "./backup";

function streamOf(chunks, { failAfter = false } = {}) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      if (failAfter) controller.error(new TypeError("network error"));
      else controller.close();
    },
  });
}

function answer(body, init = { status: 200 }) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, init)));
}

const progress = (tab, n) =>
  `data: ${JSON.stringify({ status: "processing", current_entry: tab, processed: n, total: 2 })}\n\n`;

afterEach(() => vi.unstubAllGlobals());

describe("runBackup", () => {
  it("reports progress per tab and ends in success", async () => {
    answer(
      streamOf([
        progress("Anime", 1),
        ": keepalive\n\n",
        progress("Seasonal", 2),
        'data: {"status": "success", "message": "All tabs backed up"}\n\n',
      ]),
    );
    const onProgress = vi.fn();

    const result = await runBackup({ onProgress });

    expect(result).toEqual({ status: "success", message: "All tabs backed up" });
    expect(onProgress.mock.calls.map(([e]) => e.current_entry)).toEqual([
      "Anime",
      "Seasonal",
    ]);
  });

  it("handles an event split across two chunks", async () => {
    answer(streamOf(['data: {"status": "succ', 'ess", "message": "ok"}\n\n']));

    expect(await runBackup()).toEqual({ status: "success", message: "ok" });
  });

  it("reports the server's error event as an error", async () => {
    answer(streamOf([progress("Anime", 1), 'data: {"status": "error", "message": "quota"}\n\n']));

    expect(await runBackup()).toEqual({ status: "error", message: "quota" });
  });

  it("reports busy, not failed, when another backup is running", async () => {
    answer(JSON.stringify({ detail: "A backup is already running." }), { status: 409 });

    expect(await runBackup()).toEqual({
      status: "busy",
      message: "A backup is already running.",
    });
  });

  it("reports a refusal before the stream as an error", async () => {
    answer(JSON.stringify({ detail: "Not authenticated" }), { status: 401 });

    expect(await runBackup()).toEqual({ status: "error", message: "Not authenticated" });
  });

  it("reports lost, not failed, when the stream drops mid-backup", async () => {
    answer(streamOf([progress("Anime", 1)], { failAfter: true }));

    expect(await runBackup()).toEqual({ status: "lost", message: BACKUP_LOST_MESSAGE });
  });

  it("reports lost when the stream closes without an outcome", async () => {
    answer(streamOf([progress("Anime", 1)]));

    expect((await runBackup()).status).toBe("lost");
  });
});

describe("backupToast", () => {
  it("shows busy and lost as warnings, not failures", async () => {
    const { backupToast } = await import("./backup");
    expect(backupToast({ status: "busy", message: "m" })).toEqual(["warning", "m"]);
    expect(backupToast({ status: "lost", message: "m" })).toEqual(["warning", "m"]);
    expect(backupToast({ status: "error", message: "quota" })).toEqual([
      "error",
      "Backup failed: quota",
    ]);
    expect(backupToast({ status: "success", message: "ok" })).toEqual(["success", "ok"]);
  });
});
