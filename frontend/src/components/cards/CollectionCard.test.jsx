// The collection library's card: the expectation chip comes before the
// franchise count.
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import CollectionCard from "./CollectionCard";

vi.mock("../../hooks/useViewScope", () => ({ useViewScope: () => ({ ownData: true }) }));

describe("CollectionCard", () => {
  it("draws the expectation above the franchise count", () => {
    render(
      <MemoryRouter>
        <CollectionCard
          collection={{ public_id: 1, system_id: "c", collection_expectation: "High" }}
          cover={null}
          memberCount={3}
        />
      </MemoryRouter>,
    );
    const chip = screen.getByText("High");
    const count = screen.getByText("3 franchises");
    // DOCUMENT_POSITION_FOLLOWING: the count comes after the chip.
    expect(chip.compareDocumentPosition(count) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
