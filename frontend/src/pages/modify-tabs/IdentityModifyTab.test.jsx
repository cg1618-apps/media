// Identity Modify tab: "Same as character" names the value it inherits.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ToastProvider } from "../../hooks/useToast";
import IdentityModifyTab from "./IdentityModifyTab";

// No permission by default; a test that rates gives the viewer self.list.
const auth = vi.hoisted(() => ({ has: () => false }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => auth }));
beforeEach(() => {
  auth.has = () => false;
});

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

it("loads the identity's firsts into inputs that show the notation", async () => {
  mount({ ...BASE, gender: null, display_gender: null, first_mention: "1-13", first_encounter: null });
  const mention = await screen.findByLabelText("First Mention");
  expect(mention).toHaveValue("1-13");
  for (const label of ["First Mention", "First Appearance", "First Encounter"]) {
    expect(screen.getByLabelText(label)).toHaveAttribute("placeholder", "第1卷 第13章, 1-13, S1 ep 8");
  }
  expect(screen.getByLabelText("First Encounter")).toHaveValue("");
});

it("loads the viewer's rating and PUTs only a change, after the identity", async () => {
  auth.has = (p) => p === "self.list";
  mount({ ...BASE, gender: null, display_gender: null, my_rating: "B" });
  const calls = global.fetch.mock.calls;
  const rating = await screen.findByLabelText("My Rating");
  expect(rating).toHaveValue("B");
  // Display Name, Gender and My Rating share one row.
  expect(screen.getByLabelText("Gender").closest(".grid")).toBe(rating.closest(".grid"));

  await userEvent.selectOptions(rating, "S");
  await userEvent.click(screen.getByRole("button", { name: /save identity/i }));

  await waitFor(() => expect(calls.filter(([, o]) => o?.method === "PUT")).toHaveLength(2));
  const puts = calls.filter(([, o]) => o?.method === "PUT");
  expect(puts[0][0]).toBe("/api/character-identity/i1");
  expect(JSON.parse(puts[0][1].body)).not.toHaveProperty("my_rating");
  expect(puts[1][0]).toBe("/api/me/ratings/identity/i1");
  expect(JSON.parse(puts[1][1].body)).toEqual({ my_rating: "S" });
});
