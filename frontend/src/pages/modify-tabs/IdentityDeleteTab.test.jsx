// Identity Delete tab: the confirmation names the cast-row count it will send.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ToastProvider, useToast } from "../../hooks/useToast";
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

function Toasts() {
  const { toasts } = useToast();
  return toasts.map((t) => (
    <div key={t.id} role="status">
      {t.type}: {t.message}
    </div>
  ));
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <Toasts />
        <IdentityDeleteTab />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

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

async function deleteConanAnswering(detail) {
  del.mockImplementation(() =>
    Promise.resolve({ ok: false, status: 409, json: () => Promise.resolve({ detail }) }),
  );
  mount();
  await userEvent.click(await screen.findByText(/^Conan/));
  const lists = () => fetch.mock.calls.filter(([, o]) => !o?.method).length;
  const before = lists();
  await userEvent.click(screen.getByRole("button", { name: /delete identity/i }));
  return { before, lists };
}

it("shows the server's detail on a 409 and refetches the list", async () => {
  const { before, lists } = await deleteConanAnswering("Cast rows changed; reload and confirm again.");
  expect(await screen.findByText(/Cast rows changed; reload and confirm again\./)).toBeInTheDocument();
  await waitFor(() => expect(lists()).toBeGreaterThan(before));
});

it("falls back to a generic message when detail is not a string", async () => {
  await deleteConanAnswering([{ loc: ["query", "castings"], msg: "bad" }]);
  expect(await screen.findByText(/error: Failed to delete identity\./)).toBeInTheDocument();
});
