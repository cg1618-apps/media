// The collection, franchise and series card.
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import GroupCard from "./GroupCard";

vi.mock("../../hooks/useViewScope", () => ({ useViewScope: () => ({ ownData: false }) }));

describe("GroupCard", () => {
  // No grid card names its type in a vertical spine down the cover's left edge.
  it.each(["collection", "franchise", "series"])("draws no type spine on a %s card", (kind) => {
    const { container } = render(
      <MemoryRouter>
        <GroupCard kind={kind} row={{ public_id: 1, system_id: "g" }} cover={null} />
      </MemoryRouter>
    );
    expect(container.querySelector('[style*="vertical-rl"]')).toBeNull();
  });
});
