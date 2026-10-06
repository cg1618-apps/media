// Identity Add tab: an identity needs an existing character and a name.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ToastProvider } from "../../hooks/useToast";
import IdentityAddTab from "./IdentityAddTab";

let post;

beforeEach(() => {
  post = vi.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ system_id: "i1", display_name: "Conan" }),
    }),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn((url, options = {}) => {
      if (options.method === "POST") return post(url, options);
      const body = String(url).includes("name=kudo")
        ? [{ system_id: "c1", display_name: "Kudo Shinichi" }]
        : [];
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <IdentityAddTab />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

it("will not submit without a character", async () => {
  mount();
  await userEvent.type(screen.getByLabelText("Name (English)"), "Conan");
  expect(screen.getByRole("button", { name: /add identity/i })).toBeDisabled();
  expect(post).not.toHaveBeenCalled();
});

it("posts the chosen character with the identity", async () => {
  mount();
  await userEvent.type(screen.getByRole("combobox", { name: /character/i }), "kudo");
  await userEvent.click(await screen.findByText("Kudo Shinichi"));
  await userEvent.type(screen.getByLabelText("Name (English)"), "Conan");
  await userEvent.click(screen.getByRole("button", { name: /add identity/i }));
  expect(JSON.parse(post.mock.calls[0][1].body)).toMatchObject({
    character_id: "c1",
    name_en: "Conan",
    gender: null,
  });
});

it("submits on Enter in a name field once a character is chosen", async () => {
  mount();
  await userEvent.type(screen.getByRole("combobox", { name: /character/i }), "kudo");
  await userEvent.click(await screen.findByText("Kudo Shinichi"));
  await userEvent.type(screen.getByLabelText("Name (English)"), "Conan{Enter}");
  expect(post).toHaveBeenCalledTimes(1);
  expect(JSON.parse(post.mock.calls[0][1].body)).toMatchObject({ character_id: "c1", name_en: "Conan" });
});

it("does not post when Enter picks a character from the list", async () => {
  mount();
  await userEvent.type(screen.getByLabelText("Name (English)"), "Conan");
  await userEvent.type(screen.getByRole("combobox", { name: /character/i }), "kudo");
  await screen.findByText("Kudo Shinichi");
  await userEvent.keyboard("{ArrowDown}{Enter}");
  expect(await screen.findByRole("button", { name: "Clear character" })).toBeInTheDocument();
  expect(post).not.toHaveBeenCalled();
});
