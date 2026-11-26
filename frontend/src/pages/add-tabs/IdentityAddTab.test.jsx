// Identity Add tab: an identity needs an existing character and a name.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ToastProvider } from "../../hooks/useToast";
import IdentityAddTab, { IDENTITIES_QUERY_KEY } from "./IdentityAddTab";

let post;
// No permission by default; a test that rates gives the viewer self.list.
const auth = vi.hoisted(() => ({ has: () => false }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => auth }));

beforeEach(() => {
  auth.has = () => false;
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

let client;

function mount() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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

it("invalidates the identities list after a successful create", async () => {
  mount();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  await userEvent.type(screen.getByRole("combobox", { name: /character/i }), "kudo");
  await userEvent.click(await screen.findByText("Kudo Shinichi"));
  await userEvent.type(screen.getByLabelText("Name (English)"), "Conan");
  await userEvent.click(screen.getByRole("button", { name: /add identity/i }));
  await waitFor(() =>
    expect(invalidate).toHaveBeenCalledWith({ queryKey: IDENTITIES_QUERY_KEY }),
  );
});

// Picking the character fills the identity's names from it, as a starting
// point: an identity is often a variant of its character's own name.
describe("names prefilled from the character", () => {
  const SHINICHI = {
    system_id: "c1", display_name: "Kudo Shinichi", name_en: "Kudo Shinichi", name_cn: "工藤新一",
    name_jp: "工藤 新一", name_alt: null, display_name_field: "cn", gender: "男",
  };
  const KAITO = {
    system_id: "c2", display_name: "Kuroba Kaito", name_en: "Kuroba Kaito", name_cn: "黑羽快斗",
    name_jp: null, name_alt: "Kaitou Kid", display_name_field: "en", gender: "男",
  };

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url, options = {}) => {
        if (options.method === "POST") return post(url, options);
        const q = String(url);
        const body = q.includes("name=shinichi") ? [SHINICHI] : q.includes("name=kaito") ? [KAITO] : [];
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
      }),
    );
  });

  async function pick(query, name) {
    const box = screen.queryByRole("button", { name: "Clear character" });
    if (box) await userEvent.click(box);
    await userEvent.type(screen.getByRole("combobox", { name: /character/i }), query);
    await userEvent.click(await screen.findByText(name));
  }
  const value = (label) => screen.getByLabelText(label).value;

  it("fills the four names and the display name from the picked character", async () => {
    mount();
    await pick("shinichi", "Kudo Shinichi");
    expect(value("Name (English)")).toBe("Kudo Shinichi");
    expect(value("Name (Chinese)")).toBe("工藤新一");
    expect(value("Name (Japanese)")).toBe("工藤 新一");
    expect(value("Name (Alternative)")).toBe("");
    expect(value("Display Name")).toBe("cn");
  });

  it("never fills the gender: empty means the character's", async () => {
    mount();
    await pick("shinichi", "Kudo Shinichi");
    expect(value("Gender")).toBe("");
    await userEvent.click(screen.getByRole("button", { name: /add identity/i }));
    expect(JSON.parse(post.mock.calls[0][1].body)).toMatchObject({ gender: null });
  });

  it("does not overwrite a name the admin typed", async () => {
    mount();
    await userEvent.type(screen.getByLabelText("Name (English)"), "Edogawa Conan");
    await pick("shinichi", "Kudo Shinichi");
    expect(value("Name (English)")).toBe("Edogawa Conan");
    expect(value("Name (Chinese)")).toBe("工藤新一");
  });

  it("re-fills the untouched names when another character is picked, and keeps the edited ones", async () => {
    mount();
    await pick("shinichi", "Kudo Shinichi");
    const english = screen.getByLabelText("Name (English)");
    await userEvent.clear(english);
    await userEvent.type(english, "Edogawa Conan");
    await pick("kaito", "Kuroba Kaito");
    expect(value("Name (English)")).toBe("Edogawa Conan");
    expect(value("Name (Chinese)")).toBe("黑羽快斗");
    expect(value("Name (Japanese)")).toBe("");
    expect(value("Name (Alternative)")).toBe("Kaitou Kid");
    expect(value("Display Name")).toBe("en");
  });

  it("leaves the names as they are when the character is cleared", async () => {
    mount();
    await pick("shinichi", "Kudo Shinichi");
    await userEvent.click(screen.getByRole("button", { name: "Clear character" }));
    expect(value("Name (English)")).toBe("Kudo Shinichi");
    expect(value("Name (Chinese)")).toBe("工藤新一");
  });
});

it("posts the identity's firsts, blank ones as null", async () => {
  mount();
  await userEvent.type(screen.getByRole("combobox", { name: /character/i }), "kudo");
  await userEvent.click(await screen.findByText("Kudo Shinichi"));
  await userEvent.type(screen.getByLabelText("Name (English)"), "Conan");
  expect(screen.getByLabelText("First Appearance")).toHaveAttribute(
    "placeholder",
    "第1卷 第13章, 1-13, S1 ep 8",
  );
  await userEvent.type(screen.getByLabelText("First Appearance"), "S1 ep 8");
  await userEvent.click(screen.getByRole("button", { name: /add identity/i }));
  expect(JSON.parse(post.mock.calls[0][1].body)).toMatchObject({
    first_mention: null,
    first_appearance: "S1 ep 8",
    first_encounter: null,
  });
});

describe("My Rating", () => {
  it("sits on one row with Display Name and Gender, and is PUT after the create", async () => {
    auth.has = (p) => p === "self.list";
    const put = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ owner_type: "identity", owner_id: "i1", my_rating: "A" }),
      }),
    );
    const base = global.fetch;
    global.fetch = vi.fn((url, options = {}) =>
      options.method === "PUT" ? put(url, options) : base(url, options),
    );
    mount();
    const row = screen.getByLabelText("My Rating").closest(".grid");
    expect(screen.getByLabelText("Display Name").closest(".grid")).toBe(row);
    expect(screen.getByLabelText("Gender").closest(".grid")).toBe(row);
    expect(row.className).toContain("md:grid-cols-3");

    await userEvent.type(screen.getByRole("combobox", { name: /character/i }), "kudo");
    await userEvent.click(await screen.findByText("Kudo Shinichi"));
    await userEvent.type(screen.getByLabelText("Name (English)"), "Conan");
    await userEvent.selectOptions(screen.getByLabelText("My Rating"), "A");
    await userEvent.click(screen.getByRole("button", { name: /add identity/i }));

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put.mock.calls[0][0]).toBe("/api/me/ratings/identity/i1");
    expect(JSON.parse(put.mock.calls[0][1].body)).toEqual({ my_rating: "A" });
    // The catalogue write never carries it.
    expect(JSON.parse(post.mock.calls[0][1].body)).not.toHaveProperty("my_rating");
  });

  it("is not drawn for a viewer who keeps no list", () => {
    mount();
    expect(screen.queryByLabelText("My Rating")).toBeNull();
    expect(screen.getByLabelText("Display Name").closest(".grid")).toBe(
      screen.getByLabelText("Gender").closest(".grid"),
    );
  });
});
