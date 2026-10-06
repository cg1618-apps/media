// Identity Delete tab: the confirmation names the cast-row count it will send.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ToastProvider } from "../../hooks/useToast";
import IdentityDeleteTab from "./IdentityDeleteTab";

const IDENTITIES = [
  {
    system_id: "i1",
    name_en: "Conan",
    display_name: "Conan",
    character_display_name: "Kudo Shinichi",
    casting_count: 2,
  },
];

let del;

beforeEach(() => {
  del = vi.fn(() =>
    Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ status: "success" }) }),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn((url, options = {}) => {
      if (options.method === "DELETE") return del(String(url), options);
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(IDENTITIES) });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

it("confirms with the cast-row count and says the rows fold into the main identity", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <IdentityDeleteTab />
      </ToastProvider>
    </QueryClientProvider>,
  );
  await userEvent.click(await screen.findByText(/^Conan/));
  expect(
    screen.getByText(/2 cast rows move to Kudo Shinichi's main identity/i),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /delete identity/i }));
  expect(del).toHaveBeenCalled();
  expect(del.mock.calls[0][0]).toBe("/api/character-identity/i1?castings=2");
});
