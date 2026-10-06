// Identity Modify tab: "Same as character" names the value it inherits.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";

import { ToastProvider } from "../../hooks/useToast";
import IdentityModifyTab from "./IdentityModifyTab";

function mount(identity) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([identity]) }),
    ),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <IdentityModifyTab initialId="i1" />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const BASE = {
  system_id: "i1",
  name_en: "Conan",
  display_name: "Conan",
  character_display_name: "Shinichi",
};

afterEach(() => vi.unstubAllGlobals());

it("names the character's gender when the identity has none of its own", async () => {
  mount({ ...BASE, gender: null, display_gender: "Male" });
  await screen.findByLabelText("Gender");
  expect(screen.getByRole("option", { name: "Same as character (Male)" })).toBeInTheDocument();
});

it("leaves the inherited value out once the identity has its own gender", async () => {
  mount({ ...BASE, gender: "Female", display_gender: "Female" });
  await screen.findByLabelText("Gender");
  expect(screen.getByRole("option", { name: "Same as character" })).toBeInTheDocument();
});
