// The collection, franchise and series card.
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import GroupCard from "./GroupCard";

const scope = vi.hoisted(() => ({ ownData: false }));
vi.mock("../../hooks/useViewScope", () => ({ useViewScope: () => scope }));

beforeEach(() => {
  scope.ownData = false;
});

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

// Highest, and only Highest, is drawn in the brand tone. Every expectation
// below it is checked too, so a pass means the tone follows the value rather
// than being brand for every chip.
describe("GroupCard's expectation chip", () => {
  const FIELD = {
    collection: "collection_expectation",
    franchise: "franchise_expectation",
    series: "series_expectation",
  };

  function chipFor(kind, expectation) {
    scope.ownData = true;
    render(
      <MemoryRouter>
        <GroupCard
          kind={kind}
          row={{ public_id: 1, system_id: "g", [FIELD[kind]]: expectation }}
          cover={null}
        />
      </MemoryRouter>
    );
    return screen.getByText(expectation);
  }

  it.each(["collection", "franchise", "series"])("stands out on Highest, on a %s card", (kind) => {
    expect(chipFor(kind, "Highest").className).toMatch(/text-brand/);
  });

  it.each(["High", "Medium", "Low"])("keeps %s in the neutral tone", (expectation) => {
    expect(chipFor("franchise", expectation).className).not.toMatch(/text-brand/);
  });
});
