// The game, comic and book dashboard cards: the type is the first chip, not
// text beside or over the cover, and each card shows only its own chips.
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import BookDashboardCard from "./BookDashboardCard";
import ComicDashboardCard from "./ComicDashboardCard";
import GameDashboardCard from "./GameDashboardCard";
import { ToastProvider } from "../../hooks/useToast";

function renderIn(node) {
  render(
    <MemoryRouter>
      <ToastProvider>{node}</ToastProvider>
    </MemoryRouter>,
  );
}

describe("GameDashboardCard chips", () => {
  const GAME = {
    system_id: "g1",
    public_id: "g1",
    game_name_en: "Elden Ring",
    game_type: "Base Game",
    completion_level: "Main Story",
  };

  it("leads with the game type, and names an ownership that is not Owned", () => {
    renderIn(<GameDashboardCard game={{ ...GAME, ownership: "Wishlist" }} />);
    expect(screen.queryByText("Game")).toBeNull();
    const chips = screen.getByText("Base Game").parentElement;
    expect([...chips.children].map((c) => c.textContent)).toEqual([
      "Base Game",
      "Wishlist",
      "Main Story",
    ]);
  });

  it("leaves Owned out", () => {
    renderIn(<GameDashboardCard game={{ ...GAME, ownership: "Owned" }} />);
    expect(screen.getByText("Base Game")).toBeInTheDocument();
    expect(screen.queryByText("Owned")).toBeNull();
  });
});

describe("ComicDashboardCard chips", () => {
  it("shows the comic type alone - no era, no events", () => {
    renderIn(
      <ComicDashboardCard
        comic={{
          system_id: "c1",
          public_id: "c1",
          comic_name_en: "Saga",
          comic_type: "Ongoing",
          era: "Modern Age",
          events: "Civil War",
          issue_fin: 1,
        }}
      />,
    );
    expect(screen.queryByText("Comic")).toBeNull();
    const chips = screen.getByText("Ongoing").parentElement;
    expect([...chips.children].map((c) => c.textContent)).toEqual(["Ongoing"]);
    expect(screen.queryByText("Modern Age")).toBeNull();
    expect(screen.queryByText("Civil War")).toBeNull();
  });
});

describe("BookDashboardCard chips", () => {
  it("leads with the book type and shows no region", () => {
    renderIn(
      <BookDashboardCard
        book={{
          system_id: "b1",
          public_id: "b1",
          book_name_en: "Spice and Wolf",
          type: "輕小說",
          region: "JP",
          serialization_status: "Completed",
          ch_fin: 0,
        }}
      />,
    );
    expect(screen.queryByText("Book")).toBeNull();
    expect(screen.queryByText("JP")).toBeNull();
    const chips = screen.getByText("輕小說").parentElement;
    expect([...chips.children].map((c) => c.textContent)).toEqual(["輕小說", "Completed"]);
  });
});
