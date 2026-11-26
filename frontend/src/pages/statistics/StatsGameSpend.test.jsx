// The game spend section highlights one figure per block: the converted TWD
// amount in the totals, in every By Year and By Storefront row, and TWD per
// hour in Value. The actuals per currency and the USD conversion are muted.
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import StatsGameSpend from "./StatsGameSpend";

const FX = { base: "USD", as_of: "2026-09-13", rates: { USD: 1, TWD: 32 } };
const GAMES = [
  {
    system_id: "g1",
    game_name_en: "A",
    hours_played: 40,
    price_original_us: "59.99",
    copies: [
      {
        price_paid: "20.00",
        price_currency: "USD",
        acquisition: "Bought",
        acquired_date: "2024",
        storefront: "Steam",
      },
    ],
  },
];

const highlighted = (root) =>
  Array.from(root.querySelectorAll("[data-highlight]")).map((el) => el.textContent);

function card(title) {
  return screen.getByRole("heading", { name: title }).closest("section");
}

describe("StatsGameSpend", () => {
  it("highlights only the converted TWD total in the totals block", () => {
    render(<StatsGameSpend games={GAMES} fxRates={FX} />);
    const totals = card("Game Spend");
    const figures = Array.from(totals.querySelectorAll("[data-highlight]"));
    // One per column, each beside its "≈ TWD" label.
    expect(figures.length).toBeGreaterThan(0);
    figures.forEach((dd) => expect(dd.previousElementSibling.textContent).toBe("≈ TWD"));
    expect(figures.map((dd) => dd.textContent)).toContain("640.00");
    // The USD conversion is drawn, but not highlighted.
    const usd = within(totals).getAllByText("≈ USD")[0].nextElementSibling;
    expect(usd).not.toHaveAttribute("data-highlight");
    expect(usd.className).toContain("text-text-muted");
  });

  it("highlights only the TWD figure in each By Year and By Storefront row", () => {
    render(<StatsGameSpend games={GAMES} fxRates={FX} />);
    for (const title of ["By Year", "By Storefront"]) {
      expect(highlighted(card(title))).toEqual(["≈ TWD 640.00"]);
    }
  });

  it("highlights TWD per hour in Value", () => {
    render(<StatsGameSpend games={GAMES} fxRates={FX} />);
    // 20 USD over 40 hours is 0.50 USD/h, 16.00 TWD/h at 32.
    expect(highlighted(card("Value"))[0]).toBe("≈ TWD 16.00 /h");
  });
});
