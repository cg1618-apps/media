// runBackup and runPull turn a sheet pipeline's event stream into one
// outcome. The cases that matter are the ones where the page and the server
// disagree: a refusal (another run holds the sheet), and a stream that stops
// before the run does.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BACKUP_LOST_MESSAGE,
  PULL_LOST_MESSAGE,
  backupToast,
  pullToast,
  runBackup,
  runPull,
} from "./sheets";

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

    expect(result).toMatchObject({ status: "success", message: "All tabs backed up" });
    expect(onProgress.mock.calls.map(([e]) => e.current_entry)).toEqual([
      "Anime",
      "Seasonal",
    ]);
  });

  it("handles an event split across two chunks", async () => {
    answer(streamOf(['data: {"status": "succ', 'ess", "message": "ok"}\n\n']));

    expect(await runBackup()).toMatchObject({ status: "success", message: "ok" });
  });

  it("reports the server's error event as an error", async () => {
    answer(streamOf([progress("Anime", 1), 'data: {"status": "error", "message": "quota"}\n\n']));

    expect(await runBackup()).toMatchObject({ status: "error", message: "quota" });
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

describe("runPull", () => {
  it("pulls every tab, reports progress per tab and returns the final result", async () => {
    const final = {
      status: "success",
      details: { Anime: 3, Seasonal: 1 },
      unresolved_refs: [],
    };
    answer(
      streamOf([
        progress("Anime", 1),
        ": keepalive\n\n",
        progress("Seasonal", 2),
        `data: ${JSON.stringify(final)}\n\n`,
      ]),
    );
    const onProgress = vi.fn();

    const outcome = await runPull({ onProgress });

    expect(fetch).toHaveBeenCalledWith("/api/data-control/pull", expect.anything());
    expect(onProgress.mock.calls.map(([e]) => e.current_entry)).toEqual([
      "Anime",
      "Seasonal",
    ]);
    expect(outcome).toEqual({ status: "success", message: undefined, result: final });
  });

  it("pulls the one tab it is given", async () => {
    answer(streamOf(['data: {"status": "success", "processed": 4, "rows_added": 1}\n\n']));

    const outcome = await runPull({ tab: "Anime Movie" });

    expect(fetch).toHaveBeenCalledWith(
      "/api/data-control/pull/Anime Movie",
      expect.anything(),
    );
    expect(outcome.result.rows_added).toBe(1);
  });

  it("reports a failing tab as an error with the server's message", async () => {
    answer(
      streamOf([
        progress("Anime", 1),
        'data: {"status": "error", "message": "[503] unavailable", "reason": "sheet_unavailable"}\n\n',
      ]),
    );

    expect(await runPull({ tab: "Anime" })).toMatchObject({
      status: "error",
      message: "[503] unavailable",
    });
  });

  it("reports busy, not failed, while a backup or another pull runs", async () => {
    answer(JSON.stringify({ detail: "A backup is running. Pull once it has finished." }), {
      status: 409,
    });

    expect(await runPull()).toEqual({
      status: "busy",
      message: "A backup is running. Pull once it has finished.",
    });
  });

  it("reports an unknown tab, refused before the stream, as an error", async () => {
    answer(JSON.stringify({ detail: "Unknown tab: Bogus" }), { status: 400 });

    expect(await runPull({ tab: "Bogus" })).toEqual({
      status: "error",
      message: "Unknown tab: Bogus",
    });
  });

  it("reports lost, with the pull's own message, when the stream drops", async () => {
    answer(streamOf([progress("Anime", 1)], { failAfter: true }));

    expect(await runPull()).toEqual({ status: "lost", message: PULL_LOST_MESSAGE });
  });
});

describe("pullToast", () => {
  it("names the failure, and shows a skipped tab as a warning", () => {
    expect(pullToast({ status: "error", message: "quota" })).toEqual([
      "error",
      "Pull failed: quota",
    ]);
    expect(pullToast({ status: "skipped", message: "Users: skipped" })).toEqual([
      "warning",
      "Users: skipped",
    ]);
    expect(pullToast({ status: "success" })).toEqual(["success", "Pull complete."]);
  });
});

describe("backupToast", () => {
  it("shows busy and lost as warnings, not failures", () => {
    expect(backupToast({ status: "busy", message: "m" })).toEqual(["warning", "m"]);
    expect(backupToast({ status: "lost", message: "m" })).toEqual(["warning", "m"]);
    expect(backupToast({ status: "error", message: "quota" })).toEqual([
      "error",
      "Backup failed: quota",
    ]);
    expect(backupToast({ status: "success", message: "ok" })).toEqual(["success", "ok"]);
  });
});
