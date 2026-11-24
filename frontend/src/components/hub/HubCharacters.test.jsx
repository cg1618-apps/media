// The hubs' Characters tab: what it asks for, and how it draws the answer.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import HubCharacters from "./HubCharacters";

// The viewer's scope: only ownData matters here, and it gates the my-rating sort.
const scope = vi.hoisted(() => ({ ownData: false }));
vi.mock("../../hooks/useViewScope", () => ({ useViewScope: () => scope }));

let characters = [];

beforeEach(() => {
  characters = [];
  scope.ownData = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(characters) }))
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
    </QueryClientProvider>
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
  await screen.findByRole("region", { name: "Main" });
  // Identities are off by default; the chip turns them on.
  fireEvent.click(screen.getByRole("button", { name: "Identity" }));

  expect(screen.getByRole("region", { name: "Main" })).toHaveTextContent(
    /Kudo Shinichi.*Edogawa Conan/
  );
  expect(screen.getByRole("region", { name: "No role" })).toHaveTextContent("Agasa");
  expect(document.querySelectorAll("[data-identity-card]")).toHaveLength(1);
});

describe("the filter strip", () => {
  const cast = () => [
    {
      system_id: "c1",
      public_id: 1,
      display_name: "Kudo Shinichi",
      role: "Main",
      gender: "男",
      my_rating: "B",
      identities: [
        { system_id: "i1", public_id: 2, display_name: "Edogawa Conan", display_gender: "男" },
      ],
    },
    {
      system_id: "c2",
      public_id: 3,
      display_name: "Ran",
      role: "Main",
      gender: "女",
      my_rating: "S",
      identities: [],
    },
    {
      system_id: "c3",
      public_id: 4,
      display_name: "Haro",
      role: "Main",
      gender: "其他",
      identities: [],
    },
    {
      system_id: "c4",
      public_id: 5,
      display_name: "Ai",
      role: "Main",
      gender: null,
      identities: [],
    },
    {
      system_id: "c5",
      public_id: 6,
      display_name: "Bourbon",
      role: "Main",
      gender: "中性/無性",
      identities: [],
    },
  ];
  const names = () =>
    [...screen.getByRole("region", { name: "Main" }).querySelectorAll("h3")]
      .map((n) => n.textContent)
      .filter((t) =>
        ["Kudo Shinichi", "Edogawa Conan", "Ran", "Haro", "Ai", "Bourbon"].includes(t)
      );
  const shown = (name) => screen.queryAllByText(name).length > 0;

  it("shows characters and hides identities by default", async () => {
    characters = cast();
    mount({ scope: "franchise", tierId: "f-1" });
    await screen.findByRole("region", { name: "Main" });
    expect(screen.getByRole("button", { name: "Character" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "Identity" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(shown("Kudo Shinichi")).toBe(true);
    expect(document.querySelectorAll("[data-identity-card]")).toHaveLength(0);
  });

  it("shows only identities with Identity on alone, and both with both on", async () => {
    characters = cast();
    mount({ scope: "franchise", tierId: "f-1" });
    await screen.findByRole("region", { name: "Main" });
    fireEvent.click(screen.getByRole("button", { name: "Identity" }));
    expect(document.querySelectorAll("[data-identity-card]")).toHaveLength(1);
    expect(shown("Ran")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Character" }));
    expect(document.querySelectorAll("[data-identity-card]")).toHaveLength(1);
    expect(shown("Ran")).toBe(false);
  });

  it("filters by gender, with 其他 covering every other value and none", async () => {
    characters = cast();
    mount({ scope: "franchise", tierId: "f-1" });
    await screen.findByRole("region", { name: "Main" });
    // Nothing on: no restriction.
    for (const n of ["Kudo Shinichi", "Ran", "Haro", "Ai", "Bourbon"]) expect(shown(n)).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "女" }));
    expect(shown("Ran")).toBe(true);
    expect(shown("Kudo Shinichi")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "女" }));
    fireEvent.click(screen.getByRole("button", { name: "其他" }));
    expect(shown("Haro")).toBe(true);
    expect(shown("Ai")).toBe(true);
    expect(shown("Bourbon")).toBe(true);
    expect(shown("Ran")).toBe(false);
    expect(shown("Kudo Shinichi")).toBe(false);
  });

  it("treats every gender chip on as no restriction", async () => {
    characters = cast();
    mount({ scope: "franchise", tierId: "f-1" });
    await screen.findByRole("region", { name: "Main" });
    for (const g of ["男", "女", "其他"]) fireEvent.click(screen.getByRole("button", { name: g }));
    for (const n of ["Kudo Shinichi", "Ran", "Haro", "Ai", "Bourbon"]) expect(shown(n)).toBe(true);
  });

  it("filters an identity by its own gender", async () => {
    characters = cast();
    characters[0].identities[0].display_gender = "女";
    mount({ scope: "franchise", tierId: "f-1" });
    await screen.findByRole("region", { name: "Main" });
    fireEvent.click(screen.getByRole("button", { name: "Identity" }));
    fireEvent.click(screen.getByRole("button", { name: "Character" }));
    fireEvent.click(screen.getByRole("button", { name: "女" }));
    expect(document.querySelectorAll("[data-identity-card]")).toHaveLength(1);
  });

  it("Clear all turns every chip off and shows everything", async () => {
    characters = cast();
    mount({ scope: "franchise", tierId: "f-1" });
    await screen.findByRole("region", { name: "Main" });
    fireEvent.click(screen.getByRole("button", { name: "女" }));
    fireEvent.click(screen.getByRole("button", { name: /clear all/i }));
    expect(screen.getByRole("button", { name: "Character" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(screen.getByRole("button", { name: "女" })).toHaveAttribute("aria-pressed", "false");
    expect(document.querySelectorAll("[data-identity-card]")).toHaveLength(1);
    expect(shown("Kudo Shinichi")).toBe(true);
    expect(screen.queryByRole("button", { name: /clear all/i })).toBeNull();
  });

  it("says so when the filters leave nothing", async () => {
    characters = [
      {
        system_id: "c2",
        public_id: 3,
        display_name: "Ran",
        role: "Main",
        gender: "女",
        identities: [],
      },
    ];
    mount({ scope: "franchise", tierId: "f-1" });
    await screen.findByRole("region", { name: "Main" });
    fireEvent.click(screen.getByRole("button", { name: "男" }));
    expect(screen.getByText(/No characters match/)).toBeInTheDocument();
  });

  it("sorts by name inside each group by default", async () => {
    characters = cast();
    mount({ scope: "franchise", tierId: "f-1" });
    await screen.findByRole("region", { name: "Main" });
    expect(names()).toEqual(["Ai", "Bourbon", "Haro", "Kudo Shinichi", "Ran"]);
  });

  it("offers no my-rating sort to a viewer without own data", async () => {
    characters = cast();
    mount({ scope: "franchise", tierId: "f-1" });
    await screen.findByRole("region", { name: "Main" });
    expect(screen.queryByRole("option", { name: /my rating/i })).toBeNull();
  });

  it("sorts by my rating inside each group for a viewer with own data", async () => {
    scope.ownData = true;
    characters = cast();
    mount({ scope: "franchise", tierId: "f-1" });
    await screen.findByRole("region", { name: "Main" });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "my_rating" } });
    // S, B, then the unrated in name order.
    expect(names()).toEqual(["Ran", "Kudo Shinichi", "Ai", "Bourbon", "Haro"]);
  });
});
