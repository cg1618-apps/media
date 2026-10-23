// Frontend: the Scores section of anime, anime movie, manga and novel - the
// MAL and AniList figures the detail page's ratings card shows, every one of
// them editable on both pages.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import MalAnilistScores from "./MalAnilistScores";

function renderScores(f = {}) {
  const u = vi.fn();
  const { container } = render(<MalAnilistScores f={f} u={u} />);
  return { u, container };
}

describe("MalAnilistScores", () => {
  it("opens its own Scores section", () => {
    const { container } = renderScores();
    expect(
      [...container.querySelectorAll("[data-form-section]")].map((h) => h.dataset.formSection),
    ).toEqual(["Scores"]);
  });

  it("lays out the MAL pair and AniList rating, then the two AniList ranks", () => {
    const { container } = renderScores();
    const rows = [...container.querySelectorAll(".grid")].map((row) =>
      [...row.querySelectorAll("label")].map((l) => l.textContent),
    );
    expect(rows).toEqual([
      ["MAL Rating", "MAL Rank", "AniList Rating"],
      ["AniList Rank", "AniList Popularity Rank"],
    ]);
  });

  it("keeps MAL Rank free text, since the column is a string", () => {
    renderScores({ mal_rank: "#1234" });
    expect(screen.getByRole("textbox", { name: "MAL Rank" })).toHaveValue("#1234");
  });

  it("reads each figure and writes it under its form key", () => {
    const { u } = renderScores({ anilist_rank: 12, anilist_popularity_rank: null });
    expect(screen.getByRole("spinbutton", { name: "AniList Rank" })).toHaveValue(12);
    // Unset reads as empty, not as "null".
    expect(screen.getByRole("spinbutton", { name: "AniList Popularity Rank" })).toHaveValue(null);
    for (const [name, key] of [
      ["MAL Rating", "mal_rating"],
      ["AniList Rating", "anilist_rating"],
      ["AniList Rank", "anilist_rank"],
      ["AniList Popularity Rank", "anilist_popularity_rank"],
    ]) {
      fireEvent.change(screen.getByRole("spinbutton", { name }), { target: { value: "7" } });
      expect(u).toHaveBeenLastCalledWith(key, "7");
    }
  });

  it("writes nothing on mount", () => {
    const { u } = renderScores();
    expect(u).not.toHaveBeenCalled();
  });
});
