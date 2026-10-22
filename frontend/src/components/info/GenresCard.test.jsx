// The Genres card of the seven shared-tag types: its own titled card, with
// a dash for an unset field, and nothing at all when no tag is set.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import GenresCard, { hasGenreTags } from "./GenresCard";

describe("GenresCard", () => {
  it("shows the three tags under a Genres heading", () => {
    render(
      <GenresCard item={{ genre_main: "Fantasy, Romance", genre_sub: "Isekai", label: "必看" }} />,
    );
    expect(screen.getByRole("heading", { name: "Genres" })).toBeInTheDocument();
    expect(screen.getByText("Genre (Main)")).toBeInTheDocument();
    expect(screen.getByText("Fantasy, Romance")).toBeInTheDocument();
    expect(screen.getByText("Genre (Sub)")).toBeInTheDocument();
    expect(screen.getByText("Isekai")).toBeInTheDocument();
    expect(screen.getByText("標籤 Label")).toBeInTheDocument();
    expect(screen.getByText("必看")).toBeInTheDocument();
  });

  it("dashes an unset field when another is set", () => {
    render(<GenresCard item={{ genre_main: "Action", genre_sub: null, label: "" }} />);
    expect(screen.getByText("Action")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("renders nothing when no tag is set", () => {
    const { container } = render(
      <GenresCard item={{ genre_main: null, genre_sub: "", label: "  " }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("hasGenreTags is true only when one of the three holds a value", () => {
    expect(hasGenreTags({})).toBe(false);
    expect(hasGenreTags(null)).toBe(false);
    expect(hasGenreTags({ label: "必看" })).toBe(true);
    expect(hasGenreTags({ content_labels: ["NSFW"] })).toBe(false);
  });
});
