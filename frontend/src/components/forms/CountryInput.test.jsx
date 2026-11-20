// Frontend: a studio's Countries field suggests the "Country" common options,
// takes several, and still keeps whatever is typed. Suggestions only: no
// chip row of quick picks.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CountryInput from "./CountryInput";

function mockOptions(values) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(values.map((value) => ({ value }))),
      }),
    ),
  );
}

afterEach(() => vi.unstubAllGlobals());

function Harness({ initial = "", onValue }) {
  const [value, setValue] = useState(initial);
  return (
    <CountryInput
      value={value}
      onChange={(v) => {
        setValue(v);
        onValue?.(v);
      }}
    />
  );
}

function mount(props) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Harness {...props} />
    </QueryClientProvider>,
  );
}

describe("CountryInput", () => {
  it("suggests the Country common option category", async () => {
    mockOptions(["Japan", "USA"]);
    mount();
    await userEvent.setup().click(screen.getByRole("combobox"));
    expect(await screen.findByRole("option", { name: "Japan" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "USA" })).toBeInTheDocument();
    expect(String(fetch.mock.calls[0][0])).toBe("/api/options/Country");
  });

  it("draws no chip row of quick picks", async () => {
    mockOptions(["Japan", "USA"]);
    mount();
    await userEvent.setup().click(screen.getByRole("combobox"));
    await screen.findByRole("option", { name: "Japan" });
    expect(screen.queryByRole("group", { name: "Common countries" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Japan" })).toBeNull();
  });

  it("takes several common countries from the suggestions", async () => {
    mockOptions(["Japan", "USA", "China"]);
    const onValue = vi.fn();
    mount({ onValue });
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Japan" }));
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "China" }));
    expect(onValue).toHaveBeenLastCalledWith("Japan, China");
  });

  it("keeps a country the list does not hold, beside a common one", async () => {
    mockOptions(["Japan"]);
    const onValue = vi.fn();
    mount({ initial: "Japan", onValue });
    const user = userEvent.setup();
    // The placeholder shows only while nothing is held, so the box is found by role.
    await user.type(screen.getByRole("combobox"), "Poland{Enter}");
    expect(onValue).toHaveBeenLastCalledWith("Japan, Poland");
  });
});
