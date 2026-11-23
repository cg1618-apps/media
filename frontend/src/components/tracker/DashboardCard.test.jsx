// Frontend: tests for the dashboard's watching card on a film.
//
// An Anime Movie or a Movie has no episode counter, so its card must draw no
// stepper - one would PATCH an ep_fin the film does not have - and says where
// playback was paused instead. The anime card beside it is the mirror case:
// the same harness does draw a stepper, so its absence on a film is the film
// branch's doing.
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import DashboardCard from "./DashboardCard";
import { DashboardTable } from "./DashboardTable";
import { ToastProvider } from "../../hooks/useToast";

function renderCard(anime, props = {}) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <DashboardCard anime={anime} canTrack onEpChange={vi.fn()} {...props} />
      </ToastProvider>
    </MemoryRouter>,
  );
}

const FILM = {
  system_id: "m1",
  public_id: "abc",
  movie_name_en: "Heat",
  watching_status: "Paused",
  release_status: "Released",
  time_fin: "1:02:30",
  length_min: 170,
};

describe("DashboardCard on a film", () => {
  it("draws no stepper, and says where playback was paused", () => {
    renderCard({ ...FILM, _ui_type: "Movie" });
    expect(screen.getByText("Heat")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "One forward" })).toBeNull();
    expect(screen.getByTestId("film-paused-at")).toHaveTextContent("1:02:30");
    expect(screen.getByText("170 min")).toBeInTheDocument();
  });

  it("links an anime movie to its own detail page", () => {
    renderCard({
      system_id: "am1",
      public_id: "xyz",
      anime_movie_name_en: "Your Name",
      _ui_type: "Anime Movie",
    });
    const link = screen.getByRole("link", { name: "Your Name" });
    expect(link.getAttribute("href")).toMatch(/^\/anime-movie\/xyz/);
    expect(screen.getByTestId("film-paused-at")).toHaveTextContent("—");
  });

  it("shows the paused position in list view", () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <DashboardTable>
            <DashboardCard anime={{ ...FILM, _ui_type: "Movie" }} view="list" />
          </DashboardTable>
        </ToastProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText("at 1:02:30")).toBeInTheDocument();
  });

  it("still gives an anime its stepper", () => {
    renderCard({
      system_id: "a1",
      public_id: "def",
      anime_name_en: "Frieren",
      _ui_type: "Anime",
      ep_fin: 3,
      ep_total: 28,
    });
    const card = screen.getByText("Frieren").closest("div.relative");
    expect(within(card).getByRole("button", { name: "One forward" })).toBeInTheDocument();
    expect(screen.queryByTestId("film-paused-at")).toBeNull();
  });
});
