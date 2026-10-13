// The hubs' Characters tab: what it asks for, and how it draws the answer.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import HubCharacters from "./HubCharacters";

let characters = [];

beforeEach(() => {
  characters = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(characters) }),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

function mount(props) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <HubCharacters {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it("asks for the characters of its own tier", async () => {
  mount({ scope: "series", tierId: "s-1" });
  await screen.findByText(/No characters are cast/);
  expect(String(fetch.mock.calls[0][0])).toBe("/api/character/?series_id=s-1");
});

it("draws a character and each identity cast there, grouped by role", async () => {
  characters = [
    {
      system_id: "c1",
      public_id: 1,
      display_name: "Kudo Shinichi",
      role: "Main",
      casting_count: 4,
      identities: [{ system_id: "i1", public_id: 2, display_name: "Edogawa Conan" }],
    },
    { system_id: "c2", public_id: 3, display_name: "Agasa", role: null, identities: [] },
  ];
  mount({ scope: "franchise", tierId: "f-1" });

  expect(await screen.findByRole("region", { name: "Main" })).toHaveTextContent(
    /Kudo Shinichi.*Edogawa Conan/,
  );
  expect(screen.getByRole("region", { name: "No role" })).toHaveTextContent("Agasa");
  expect(document.querySelectorAll("[data-identity-card]")).toHaveLength(1);
});
