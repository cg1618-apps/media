// Frontend: unit tests for the new-password checks.
/**
 * Only the two checks the server has: empty, and past 72 UTF-8 bytes. A
 * one-character password is accepted - there is no minimum length - and the
 * limit counts bytes, so a multi-byte password hits it at fewer characters.
 */
import { describe, expect, it } from "vitest";

import { MAX_PASSWORD_BYTES, newPasswordProblem } from "./newPassword";

describe("newPasswordProblem", () => {
  it("refuses an empty password", () => {
    expect(newPasswordProblem("", "")).toMatch(/cannot be empty/);
  });

  it("accepts a one-character password", () => {
    expect(newPasswordProblem("a", "a")).toBeNull();
  });

  it("accepts exactly 72 bytes", () => {
    const pw = "a".repeat(MAX_PASSWORD_BYTES);
    expect(newPasswordProblem(pw, pw)).toBeNull();
  });

  it("counts bytes, not characters", () => {
    // 25 characters, 75 bytes: three bytes each in UTF-8.
    const pw = "密".repeat(25);
    expect(newPasswordProblem(pw, pw)).toMatch(/at most 72 bytes; this one is 75/);
  });

  it("refuses two passwords that differ", () => {
    expect(newPasswordProblem("one", "two")).toMatch(/do not match/);
  });
});
