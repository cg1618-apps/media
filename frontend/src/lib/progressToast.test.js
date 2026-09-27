import { describe, it, expect } from "vitest";
import { progressToast, COMPLETED_TOAST } from "./progressToast";

describe("progressToast", () => {
  it("announces a write that finished the entry", () => {
    expect(
      progressToast(
        { watching_status: "Watching" },
        { watching_status: "Completed" },
        "Episodes updated!",
      ),
    ).toBe(COMPLETED_TOAST);
  });

  it("reads reading_status for the reading types", () => {
    expect(
      progressToast(
        { reading_status: "Reading" },
        { reading_status: "Completed" },
        "Chapters updated!",
      ),
    ).toBe(COMPLETED_TOAST);
  });

  it("keeps the ordinary message when the status did not change", () => {
    expect(
      progressToast(
        { watching_status: "Watching" },
        { watching_status: "Watching" },
        "Episodes updated!",
      ),
    ).toBe("Episodes updated!");
  });

  it("does not re-announce an entry that was already finished", () => {
    expect(
      progressToast(
        { watching_status: "Completed" },
        { watching_status: "Completed" },
        "Episodes updated!",
      ),
    ).toBe("Episodes updated!");
  });

  it("falls back when the response carried no row", () => {
    expect(progressToast({ watching_status: "Watching" }, null, "Saved")).toBe(
      "Saved",
    );
  });
});
