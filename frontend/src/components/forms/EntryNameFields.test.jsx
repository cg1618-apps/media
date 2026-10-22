// Frontend: the name inputs of every entry form, in the one order the
// detail page's naming card uses - CN first, then EN, Romaji beside the
// native name, Alt across the full width.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import EntryNameFields from "./EntryNameFields";

function renderNames(props) {
  const u = vi.fn();
  const { container } = render(<EntryNameFields f={{}} u={u} {...props} />);
  const labels = [...container.querySelectorAll("label")].map((l) => l.textContent);
  return { u, container, labels };
}

const rowOf = (name) => screen.getByRole("textbox", { name }).closest(".grid");

describe("EntryNameFields", () => {
  it("lays out cn | en, romaji | jp, then alt full width", () => {
    const { labels } = renderNames({ prefix: "anime", label: "Anime" });
    expect(labels).toEqual([
      "Anime Name CN",
      "Anime Name EN",
      "Anime Name Romaji",
      "Anime Name JP",
      "Anime Name Alt",
    ]);
    expect(rowOf("Anime Name CN")).toBe(rowOf("Anime Name EN"));
    expect(rowOf("Anime Name Romaji")).toBe(rowOf("Anime Name JP"));
    expect(rowOf("Anime Name CN")).not.toBe(rowOf("Anime Name Romaji"));
    expect(rowOf("Anime Name CN").className).toContain("md:grid-cols-2");
    // Alt sits outside the two-column rows, so it spans the card.
    expect(rowOf("Anime Name Alt")).toBeNull();
  });

  it("renders only the names the type has", () => {
    const { labels } = renderNames({
      prefix: "movie",
      label: "Movie",
      names: ["cn", "en", "alt"],
    });
    expect(labels).toEqual(["Movie Name CN", "Movie Name EN", "Movie Name Alt"]);
    expect(screen.queryByRole("textbox", { name: /Romaji/ })).toBeNull();
  });

  it("keeps the placeholders the Add tabs have always shown", () => {
    renderNames({ prefix: "anime", label: "Anime" });
    // Add.anime.test.jsx finds the EN input by this placeholder.
    expect(screen.getByPlaceholderText("English title")).toHaveAttribute(
      "aria-label",
      "Anime Name EN",
    );
    expect(screen.getByPlaceholderText("Chinese title")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Japanese title")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Alternative title")).toBeInTheDocument();
  });

  it("lets a type override a placeholder", () => {
    renderNames({
      prefix: "anime",
      label: "Anime",
      placeholders: { en: "Official English title" },
    });
    expect(screen.getByRole("textbox", { name: "Anime Name EN" })).toHaveAttribute(
      "placeholder",
      "Official English title",
    );
  });

  it("shows only the native name `shows` allows, alone in the left half", () => {
    // H-Comic: the region's own name, JP or KR, never both.
    const names = ["cn", "en", "jp", "kr", "alt"];
    const { labels } = renderNames({
      prefix: "h_comic",
      label: "H-Comic",
      names,
      shows: (key) => key !== "h_comic_name_jp",
    });
    expect(labels).toEqual([
      "H-Comic Name CN",
      "H-Comic Name EN",
      "H-Comic Name KR",
      "H-Comic Name Alt",
    ]);
    const kr = rowOf("H-Comic Name KR");
    expect(kr.className).toContain("md:grid-cols-2");
    expect(kr.querySelectorAll("input")).toHaveLength(1);
  });

  it("reads each value from the form and writes it under its column key", async () => {
    const { u } = renderNames({
      prefix: "anime_movie",
      label: "Anime Movie",
      f: { anime_movie_name_cn: "劇場版" },
    });
    expect(screen.getByRole("textbox", { name: "Anime Movie Name CN" })).toHaveValue("劇場版");
    await userEvent.type(screen.getByRole("textbox", { name: "Anime Movie Name Romaji" }), "x");
    expect(u).toHaveBeenCalledWith("anime_movie_name_roman", "x");
  });
});
