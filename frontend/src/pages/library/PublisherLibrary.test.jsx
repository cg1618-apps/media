import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PublisherLibrary from "./PublisherLibrary";

const PUBLISHERS = [
  {
    system_id: "1",
    public_id: "pb1",
    name_en: "Bandai Namco",
    display_name: "Bandai Namco",
    credit_count: 12,
    media_types: ["game"],
    scopes: ["game"],
    country: "Japan",
  },
  {
    system_id: "2",
    public_id: "pb2",
    name_en: "Muse Communication",
    name_cn: "木棉花",
    display_name_field: "cn",
    display_name: "木棉花",
    credit_count: 30,
    media_types: ["anime"],
    scopes: ["anime", "manga"],
    country: "Taiwan",
  },
  // Offered on novels but credited on nothing yet.
  {
    system_id: "3",
    public_id: "pb3",
    name_en: "Kadokawa Taiwan",
    display_name: "Kadokawa Taiwan",
    credit_count: 0,
    media_types: [],
    scopes: ["novel"],
    country: null,
  },
];

beforeEach(() => {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(PUBLISHERS) }),
  );
});

function renderPage() {
  return render(
    <MemoryRouter>
      <PublisherLibrary />
    </MemoryRouter>,
  );
}

describe("PublisherLibrary", () => {
  it("lists every publisher by its display name", async () => {
    renderPage();
    expect(await screen.findByText("木棉花")).toBeInTheDocument();
    expect(screen.getByText("Bandai Namco")).toBeInTheDocument();
  });

  it("searches across every name field, not just the displayed one", async () => {
    renderPage();
    await screen.findByText("木棉花");
    await userEvent.type(screen.getByRole("searchbox"), "Muse Communication");
    await waitFor(() => {
      expect(screen.getByText("木棉花")).toBeInTheDocument();
      expect(screen.queryByText("Bandai Namco")).not.toBeInTheDocument();
    });
  });

  it("links each publisher to its detail page", async () => {
    renderPage();
    expect(await screen.findByRole("link", { name: /木棉花/ })).toHaveAttribute(
      "href",
      "/publisher/pb2/muse-communication",
    );
  });

  it("opens with the filter panel shown, every type and No entries on, and no Restricted chip", async () => {
    renderPage();
    await screen.findByText("木棉花");
    expect(screen.getByRole("button", { name: /^Filters/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    for (const name of ["Anime", "Anime Movie", "Manga", "Novel", "Comic", "Game", "No entries"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "true");
    }
    expect(screen.queryByRole("button", { name: "Restricted" })).not.toBeInTheDocument();
    // An uncredited publisher is listed by default.
    expect(screen.getByText("Kadokawa Taiwan")).toBeInTheDocument();
  });

  it("matches a type the publisher is offered on as well as one it is credited on", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("木棉花");
    await user.click(screen.getByRole("button", { name: "Clear all" }));
    await user.click(screen.getByRole("button", { name: "Manga" }));
    // Muse is credited on anime only, but offered on manga.
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual([
      expect.stringContaining("木棉花"),
    ]);
    await user.click(screen.getByRole("button", { name: "Novel" }));
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("filters by country, with Not set for none", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("木棉花");
    const country = screen.getByText("Country").parentElement;
    await user.click(within(country).getByRole("button", { name: "Taiwan" }));
    await user.click(within(country).getByRole("button", { name: "Not set" }));
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.queryByText("Bandai Namco")).not.toBeInTheDocument();
  });
});
