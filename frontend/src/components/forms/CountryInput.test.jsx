// Frontend: a studio's Country field suggests the "Country" common options
// and still keeps whatever is typed.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
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
  it("reads the Country common option category", async () => {
    mockOptions(["Japan", "USA"]);
    mount();
    await screen.findByRole("button", { name: "Japan" });
    expect(String(fetch.mock.calls[0][0])).toBe("/api/options/Country");
  });

  it("picks a common country with one click, and clears it with another", async () => {
    mockOptions(["Japan", "USA"]);
    const onValue = vi.fn();
    mount({ onValue });
    fireEvent.click(await screen.findByRole("button", { name: "Japan" }));
    expect(screen.getByRole("combobox", { name: "Country" })).toHaveValue("Japan");
    fireEvent.click(screen.getByRole("button", { name: "Japan" }));
    expect(onValue).toHaveBeenLastCalledWith("");
  });

  it("keeps a country the list does not hold, as typed", async () => {
    mockOptions(["Japan"]);
    mount();
    const field = screen.getByRole("combobox", { name: "Country" });
    fireEvent.change(field, { target: { value: "Poland" } });
    expect(field).toHaveValue("Poland");
  });
});
