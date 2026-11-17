// DataHistory's deleted-records table: a tombstone keeps the type label it was
// written under, so a book deleted before Novel became Book still reads
// "Novel" and must get the same franchise/series detail as one labelled "Book".
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import DataHistory from "./DataHistory";

const DELETED = [
  {
    id: 1,
    timestamp: "2026-11-01T10:00:00Z",
    type: "Novel",
    name_cn: "舊書",
    franchise_cn: "Old Franchise",
    series_cn: "Old Series",
  },
  {
    id: 2,
    timestamp: "2026-11-02T10:00:00Z",
    type: "Book",
    name_cn: "新書",
    franchise_cn: "New Franchise",
    series_cn: "New Series",
  },
];

function ok(body) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

afterEach(() => vi.unstubAllGlobals());

describe("DataHistory - deleted records", () => {
  it("shows the franchise and series of a book tombstone under either label", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url) => ok(String(url).startsWith("/api/system/deleted") ? DELETED : [])),
    );
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <DataHistory />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Franchise: Old Franchise")).toBeInTheDocument();
    expect(screen.getByText("Series: Old Series")).toBeInTheDocument();
    expect(screen.getByText("Franchise: New Franchise")).toBeInTheDocument();
    expect(screen.getByText("Series: New Series")).toBeInTheDocument();
  });
});
