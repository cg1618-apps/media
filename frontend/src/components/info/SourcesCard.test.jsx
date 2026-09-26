// Two sections, not one flat list: where to watch/read, and where to look up.
// Row order comes from the server (vocabulary sort_order), so the card must
// not re-sort.
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import SourcesCard, { accessHeading } from "./SourcesCard";

const rows = [
  { system_id: "1", kind: "access", bucket: "main", name: "Bahamut", url: "https://b.test", available: true },
  { system_id: "2", kind: "access", bucket: "main", name: "Netflix", url: null, available: false },
  { system_id: "3", kind: "access", bucket: "restricted", name: "Elsewhere", url: "https://e.test" },
  { system_id: "4", kind: "reference", bucket: "main", name: "Wikipedia", url: "https://w.test" },
];

describe("SourcesCard", () => {
  it("splits access rows from reference rows", () => {
    render(<SourcesCard sources={rows} mediaType="anime" />);
    const watch = screen.getByRole("region", { name: /where to watch/i });
    expect(within(watch).getByText("Bahamut")).toBeInTheDocument();
    expect(within(watch).queryByText("Wikipedia")).not.toBeInTheDocument();
  });

  it("says Where to Read for a reading type", () => {
    render(<SourcesCard sources={rows} mediaType="manga" />);
    expect(screen.getByRole("region", { name: /where to read/i })).toBeInTheDocument();
  });

  it("keeps the server's order", () => {
    render(<SourcesCard sources={rows} mediaType="anime" />);
    const names = screen.getAllByTestId("source-name").map((n) => n.textContent);
    expect(names.slice(0, 2)).toEqual(["Bahamut", "Netflix"]);
  });

  it("renders an unavailable platform as text, not a link", () => {
    render(<SourcesCard sources={rows} mediaType="anime" />);
    expect(screen.queryByRole("link", { name: /netflix/i })).toBeNull();
  });

  it("renders the column-backed links alongside the rows", () => {
    render(
      <SourcesCard sources={rows} mediaType="anime" malLink="https://mal.test" />,
    );
    expect(screen.getByRole("link", { name: /myanimelist/i })).toBeInTheDocument();
  });

  it("renders an h-comic's E-Hentai gallery under Where to Look Up", () => {
    render(
      <SourcesCard
        sources={[]}
        mediaType="h-comic"
        ehentaiLink="https://e-hentai.org/g/618395/0439fa3666/"
      />,
    );
    const section = screen.getByRole("region", { name: "Where to Look Up" });
    expect(within(section).getByRole("link", { name: /e-hentai/i })).toHaveAttribute(
      "href",
      "https://e-hentai.org/g/618395/0439fa3666/",
    );
  });

  // A game's Steam page is a storefront, not a reference database, so it
  // belongs beside the access rows rather than with IGDB and MAL.
  it("renders the Steam link under Where to Play", () => {
    render(
      <SourcesCard
        sources={rows}
        mediaType="game"
        steamLink="https://store.steampowered.com/app/1/"
      />,
    );
    const play = screen.getByRole("region", { name: /where to play/i });
    expect(
      within(play).getByRole("link", { name: /steam/i }),
    ).toHaveAttribute("href", "https://store.steampowered.com/app/1/");
  });

  // The access section is gated on the rows, so a game whose only place to
  // play is its Steam page used to lose the section - and the link with it.
  it("shows Where to Play for a Steam link with no access rows", () => {
    render(
      <SourcesCard
        sources={[]}
        mediaType="game"
        steamLink="https://store.steampowered.com/app/1/"
      />,
    );
    expect(
      screen.getByRole("link", { name: /steam/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/no sources recorded/i)).toBeNull();
  });

  // `available` is NULL on every reference row and every free-form row by
  // design - only main access rows carry the tristate. A row with a URL is a
  // link regardless.
  it("renders a reference row with a URL as a link", () => {
    render(<SourcesCard sources={rows} mediaType="anime" />);
    expect(
      screen.getByRole("link", { name: /wikipedia/i }),
    ).toHaveAttribute("href", "https://w.test");
  });

  it("renders a free-form row with a URL as a link", () => {
    render(<SourcesCard sources={rows} mediaType="anime" />);
    expect(
      screen.getByRole("link", { name: /elsewhere/i }),
    ).toHaveAttribute("href", "https://e.test");
  });

  it("leaves a row with neither a verdict nor a URL as plain text", () => {
    render(
      <SourcesCard
        sources={[
          { system_id: "9", kind: "reference", bucket: "main", name: "Fandom wiki" },
        ]}
        mediaType="anime"
      />,
    );
    expect(screen.queryByRole("link", { name: /fandom/i })).toBeNull();
    expect(screen.getByText("Fandom wiki")).toBeInTheDocument();
  });

  it("says so when there is nothing at all", () => {
    render(<SourcesCard sources={[]} mediaType="anime" />);
    expect(screen.getByText(/no sources recorded/i)).toBeInTheDocument();
  });
});

describe("accessHeading", () => {
  it("is three-way", () => {
    expect(accessHeading("anime")).toBe("Where to Watch");
    expect(accessHeading("manga")).toBe("Where to Read");
    expect(accessHeading("game")).toBe("Where to Play");
  });
});
