import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MEDIA_TYPES } from "../../config/fieldOptions";
import { GATED_TYPES } from "../../lib/gatedTypes";
import ScopePicker from "./ScopePicker";

// Both Options tabs hand ScopePicker the MEDIA_TYPES fallback, which names
// every gated type until /api/constants answers. A session that cannot see a
// gated type is not told it exists, so the picker filters what it draws.
const auth = { visibleGatedTypes: [] };
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => auth }));

function renderPicker() {
  return render(
    <ScopePicker scopes={[]} setScopes={vi.fn()} mediaTypes={MEDIA_TYPES} />,
  );
}

describe("ScopePicker", () => {
  // Load-bearing: without a gated type in the fallback the refusal below
  // would pass with nothing to refuse.
  it("is handed a fallback that names a gated type", () => {
    expect(GATED_TYPES.length).toBeGreaterThan(0);
    expect(MEDIA_TYPES).toContain("h-comic");
  });

  it("does not draw a gated type for a session that cannot see it", () => {
    auth.visibleGatedTypes = [];
    renderPicker();
    expect(screen.queryByRole("button", { name: "h-comic" })).toBeNull();
    expect(screen.getByRole("button", { name: "manga" })).toBeInTheDocument();
  });

  it("draws a gated type for a session that can see it", () => {
    auth.visibleGatedTypes = ["h-comic"];
    renderPicker();
    expect(screen.getByRole("button", { name: "h-comic" })).toBeInTheDocument();
    auth.visibleGatedTypes = [];
  });
});
