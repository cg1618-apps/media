// Frontend: the Control Center's Exchange Rates card.
//
// Pins the three currencies it keeps rates for - USD, TWD and JPY - with the
// base taking no box of its own, and that it saves only those. A stored table
// carrying a fourth currency (EUR) is load-bearing: without it, "no EUR box"
// would hold over a table that never had one.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import FxRatesEditor from "./FxRatesEditor";

const STORED = {
  base: "TWD",
  as_of: "2026-11-01",
  rates: { TWD: 1, USD: 0.031, JPY: 4.7, EUR: 0.029 },
};

let fetchMock;

beforeEach(() => {
  fetchMock = vi.fn(async (url, options) => {
    if (options?.method === "PUT") {
      return { ok: true, json: async () => JSON.parse(options.body) };
    }
    return { ok: true, json: async () => STORED };
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FxRatesEditor", () => {
  it("offers USD, TWD and JPY only, the base without a box", async () => {
    render(<FxRatesEditor showToast={vi.fn()} />);

    expect(await screen.findByDisplayValue("0.031")).toBeInTheDocument();
    expect(screen.getByText("USD per TWD")).toBeInTheDocument();
    expect(screen.getByText("JPY per TWD")).toBeInTheDocument();
    expect(screen.queryByText("TWD per TWD")).not.toBeInTheDocument();
    expect(screen.queryByText(/EUR/)).not.toBeInTheDocument();
    const bases = screen.getAllByRole("option").map((o) => o.value);
    expect(bases).toEqual(["USD", "TWD", "JPY"]);
  });

  it("carries no explanatory paragraph", async () => {
    render(<FxRatesEditor showToast={vi.fn()} />);
    await screen.findByDisplayValue("0.031");
    expect(screen.queryByText(/Used to convert game spend/)).not.toBeInTheDocument();
  });

  it("saves the three currencies' rates and nothing else", async () => {
    render(<FxRatesEditor showToast={vi.fn()} />);
    await screen.findByDisplayValue("0.031");

    fireEvent.click(screen.getByRole("button", { name: "Save Rates" }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, o]) => o?.method === "PUT")).toBe(true),
    );
    const [, put] = fetchMock.mock.calls.find(([, o]) => o?.method === "PUT");
    expect(JSON.parse(put.body)).toEqual({
      base: "TWD",
      as_of: "2026-11-01",
      rates: { USD: 0.031, JPY: 4.7 },
    });
  });
});
