import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StudioLibrary from "./StudioLibrary";

// A session that may see every gated type, so the Restricted chip is drawn.
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ visibleGatedTypes: ["h-comic", "h-game", "hentai"] }),
}));

const STUDIOS = [
  { system_id: "1", public_id: "s1", name_en: "MAPPA", display_name: "MAPPA", credit_count: 12,
    media_types: ["anime"], country: "Japan", my_rating: "A" },
  { system_id: "2", public_id: "s2", name_en: "Kyoto Animation", name_alt: "KyoAni",
    display_name_field: "alt", display_name: "KyoAni", credit_count: 30,
    media_types: ["anime", "anime-movie"], country: "Japan", my_rating: "S" },
  { system_id: "3", public_id: "s3", name_jp: "京都アニメーション", display_name: "京都アニメーション",
    credit_count: 1, media_types: ["game"], country: null, my_rating: null },
  // Credited on hentai only: hidden until Restricted is ticked.
  { system_id: "4", public_id: "s4", name_en: "Pink Pineapple", display_name: "Pink Pineapple",
    credit_count: 3, media_types: ["hentai"], restricted: true, country: "Japan", my_rating: null },
  // Credited on nothing yet: listed by default under No entries.
  { system_id: "5", public_id: "s5", name_en: "Fresh Studio", display_name: "Fresh Studio",
    credit_count: 0, media_types: [], country: "China", my_rating: null },
];

beforeEach(() => {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(STUDIOS) }),
  );
});

function renderPage() {
  return render(
    <MemoryRouter>
      <StudioLibrary />
    </MemoryRouter>,
  );
}

describe("StudioLibrary", () => {
  it("lists every studio by its display name", async () => {
    renderPage();
    expect(await screen.findByText("KyoAni")).toBeInTheDocument();
    expect(screen.getByText("MAPPA")).toBeInTheDocument();
  });

  it("searches across every name field, not just the displayed one", async () => {
    renderPage();
    await screen.findByText("KyoAni");
    await userEvent.type(screen.getByRole("searchbox"), "Kyoto Animation");
    await waitFor(() => {
      expect(screen.getByText("KyoAni")).toBeInTheDocument();
      expect(screen.queryByText("MAPPA")).not.toBeInTheDocument();
    });
  });

  it("links each studio to its detail page", async () => {
    renderPage();
    expect(await screen.findByRole("link", { name: /KyoAni/ })).toHaveAttribute(
      "href",
      "/studio/s2/kyoto-animation",
    );
  });

  it("opens with the filter panel shown and the plain types and No entries on", async () => {
    renderPage();
    await screen.findByText("KyoAni");
    expect(screen.getByRole("button", { name: /^Filters/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    for (const name of ["Anime", "Anime Movie", "Game", "No entries"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "true");
    }
    for (const name of ["Restricted", "Hentai", "H-Game"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("hides a restricted-only studio by default and shows it once Restricted is ticked", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("KyoAni");
    expect(screen.queryByText("Pink Pineapple")).not.toBeInTheDocument();
    expect(screen.getByText("Fresh Studio")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(4);

    await user.click(screen.getByRole("button", { name: "Restricted" }));
    expect(screen.getByText("Pink Pineapple")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(5);
  });

  it("filters by the countries on record, with Not set for none", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("KyoAni");
    const country = screen.getByText("Country").parentElement;
    expect(
      within(country).getAllByRole("button").map((b) => b.textContent),
    ).toEqual(["China", "Japan", "Not set"]);

    await user.click(within(country).getByRole("button", { name: "Not set" }));
    const cards = screen.getAllByRole("link").map((a) => a.textContent);
    expect(cards).toEqual([expect.stringContaining("京都アニメーション")]);
  });

  it("filters by my rating, ANDed with the entry type", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("KyoAni");
    const rating = screen.getByText("My Rating").parentElement;
    await user.click(within(rating).getByRole("button", { name: "Unrated" }));
    // Pink Pineapple is unrated too, but its only type is off by default.
    const cards = screen.getAllByRole("link").map((a) => a.textContent);
    expect(cards).toHaveLength(2);
    expect(screen.queryByText("Pink Pineapple")).not.toBeInTheDocument();
  });
});
