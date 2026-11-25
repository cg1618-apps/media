// Two sections, not one flat list: where to watch/read, and where to look up.
// Row order comes from the server (vocabulary sort_order), so the card must
// not re-sort.
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FALLBACK_SVG } from "../../lib/covers";
import SourcesCard, { accessHeading } from "./SourcesCard";

const rows = [
  { system_id: "1", kind: "access", bucket: "main", name: "動畫瘋", url: "https://b.test", available: true },
  { system_id: "2", kind: "access", bucket: "main", name: "Netflix", url: null, available: false },
  { system_id: "3", kind: "access", bucket: "restricted", name: "Elsewhere", url: "https://e.test" },
  { system_id: "4", kind: "reference", bucket: "main", name: "Wikipedia", url: "https://w.test" },
];

describe("SourcesCard", () => {
  it("splits access rows from reference rows", () => {
    render(<SourcesCard sources={rows} mediaType="anime" />);
    const watch = screen.getByRole("region", { name: /where to watch/i });
    expect(within(watch).getByText("動畫瘋")).toBeInTheDocument();
    expect(within(watch).queryByText("Wikipedia")).not.toBeInTheDocument();
  });

  it("says Where to Read for a reading type", () => {
    render(<SourcesCard sources={rows} mediaType="manga" />);
    expect(screen.getByRole("region", { name: /where to read/i })).toBeInTheDocument();
  });

  it("keeps the server's order", () => {
    render(<SourcesCard sources={rows} mediaType="anime" />);
    const names = screen.getAllByTestId("source-name").map((n) => n.textContent);
    expect(names.slice(0, 2)).toEqual(["動畫瘋", "Netflix"]);
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

  it("draws a main row's own icon, and none for a name without one", () => {
    const sources = [
      ...rows,
      { system_id: "5", kind: "reference", bucket: "main", name: "Official site", url: "https://o.test" },
    ];
    render(<SourcesCard sources={sources} mediaType="anime" />);
    const baha = screen.getByRole("link", { name: /動畫瘋/ });
    expect(within(baha).getByTestId("source-icon")).toHaveAttribute(
      "src",
      expect.stringContaining("bahamut"),
    );
    const official = screen.getByRole("link", { name: /official site/i });
    expect(within(official).queryByTestId("source-icon")).toBeNull();
  });

  // The restricted row carries a name that HAS an icon, so a missing icon
  // proves the bucket check refused it rather than the lookup finding nothing.
  it("never draws an icon on a restricted row, even under an iconed name", () => {
    const sources = [
      { system_id: "1", kind: "access", bucket: "restricted", name: "Bilibili", url: "https://r.test" },
      { system_id: "2", kind: "access", bucket: "main", name: "Bilibili", url: "https://m.test" },
    ];
    render(<SourcesCard sources={sources} mediaType="anime" />);
    const [restricted, main] = screen.getAllByRole("link", { name: /bilibili/i });
    expect(restricted).toHaveAttribute("href", "https://r.test");
    expect(within(restricted).queryByTestId("source-icon")).toBeNull();
    expect(within(main).getByTestId("source-icon")).toBeInTheDocument();
  });

  // The icon names the site, so no link carries a tag box beside it -
  // including the column-backed ones, and one whose site has no icon.
  it("draws no tag box on any source link", () => {
    render(
      <SourcesCard
        sources={rows}
        mediaType="game"
        steamLink="https://store.steampowered.com/app/1/"
        igdbLink="https://igdb.test"
        malLink="https://mal.test"
      />,
    );
    for (const tag of ["Steam", "IGDB", "MAL"]) {
      expect(screen.queryByText(tag, { exact: true })).toBeNull();
    }
  });

  it("draws the site's icon on a column-backed link", () => {
    render(<SourcesCard sources={[]} mediaType="anime" malLink="https://mal.test" />);
    const mal = screen.getByRole("link", { name: /myanimelist/i });
    expect(within(mal).getByTestId("source-icon")).toHaveAttribute(
      "src",
      expect.stringContaining("myanimelist"),
    );
  });

  it("renders a hentai's AniDB link under Where to Look Up", () => {
    render(
      <SourcesCard sources={[]} mediaType="hentai" anidbLink="https://anidb.net/anime/1" />,
    );
    const link = screen.getByRole("link", { name: /anidb/i });
    expect(link).toHaveAttribute("href", "https://anidb.net/anime/1");
    expect(screen.getByRole("region", { name: "Where to Look Up" })).toContainElement(link);
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

  // An official site has no favicon of its own in the bundle, so it wears the
  // entry's cover - the same URL the page already shows, never a copy.
  describe("the official site's icon", () => {
    const official = (bucket = "main") => ({
      system_id: "5",
      kind: "reference",
      bucket,
      name: "Official site",
      url: "https://official.test",
    });
    const iconIn = (name) =>
      within(screen.getByRole("link", { name })).queryByTestId("source-icon");

    it("is the entry's cover", () => {
      render(
        <SourcesCard
          sources={[official()]}
          mediaType="anime"
          coverUrl="/api/covers/anime/1.jpg"
        />,
      );
      expect(iconIn(/official site/i)).toHaveAttribute(
        "src",
        "/api/covers/anime/1.jpg",
      );
    });

    it("is not the no-image placeholder", () => {
      render(
        <SourcesCard
          sources={[official()]}
          mediaType="anime"
          coverUrl={FALLBACK_SVG}
        />,
      );
      expect(iconIn(/official site/i)).toBeNull();
    });

    it("is not given to a typed row that merely says Official site", () => {
      render(
        <SourcesCard
          sources={[official("other")]}
          mediaType="anime"
          coverUrl="/api/covers/anime/1.jpg"
        />,
      );
      expect(iconIn(/official site/i)).toBeNull();
    });

    it("leaves every other source on its own icon", () => {
      render(
        <SourcesCard
          sources={rows}
          mediaType="anime"
          coverUrl="/api/covers/anime/1.jpg"
        />,
      );
      expect(iconIn(/wikipedia/i)).not.toHaveAttribute(
        "src",
        "/api/covers/anime/1.jpg",
      );
    });
  });

  // A movie's and an h-comic's original source stay tags; a TV show's and a
  // cartoon's are drawn as rows (originalSourceAsAccess, below).
  it("splits a joined original source and gives each platform its icon", () => {
    render(
      <SourcesCard
        sources={[]}
        mediaType="movie"
        originalSource="Netflix, Cinema"
      />,
    );
    const tags = screen.getAllByTestId("source-tag");
    expect(tags.map((t) => t.textContent)).toEqual(["Netflix", "Cinema"]);
    expect(within(tags[0]).getByTestId("source-tag-icon")).toBeInTheDocument();
    // Cinema has no site, so no icon: the mirror case proves the icon comes
    // from the value rather than from every tag.
    expect(within(tags[1]).queryByTestId("source-tag-icon")).toBeNull();
  });

  it("gives an exclusive source its icon", () => {
    render(<SourcesCard sources={[]} mediaType="anime" exclusiveSource="Crunchyroll" />);
    const tag = screen.getByTestId("source-tag");
    expect(tag).toHaveTextContent("Crunchyroll");
    expect(within(tag).getByTestId("source-tag-icon")).toBeInTheDocument();
  });

  describe("the exclusive source", () => {
    const watch = [
      { system_id: "1", kind: "access", bucket: "main", name: "動畫瘋", url: "https://b.test", available: true },
      { system_id: "2", kind: "access", bucket: "main", name: "Netflix", url: "https://n.test", available: true },
      // Typed text that reads the same is not the platform.
      { system_id: "3", kind: "access", bucket: "other", name: "Crunchyroll", url: null, available: null },
    ];

    it("leads the access rows, marked (Exclusive)", () => {
      render(<SourcesCard sources={watch} mediaType="anime" exclusiveSource="Netflix" />);
      const names = screen.getAllByTestId("source-name").map((n) => n.textContent);
      expect(names).toEqual(["Netflix (Exclusive)", "動畫瘋", "Crunchyroll"]);
      expect(screen.getByRole("link", { name: /netflix \(exclusive\)/i })).toHaveAttribute(
        "href",
        "https://n.test",
      );
      // The row says it, so the tag does not say it again.
      expect(screen.queryByTestId("source-tag")).toBeNull();
    });

    it("keeps the server's order and no mark without one", () => {
      render(<SourcesCard sources={watch} mediaType="anime" />);
      const names = screen.getAllByTestId("source-name").map((n) => n.textContent);
      expect(names).toEqual(["動畫瘋", "Netflix", "Crunchyroll"]);
    });

    it("stays a tag when no main access row matches it", () => {
      render(<SourcesCard sources={watch} mediaType="anime" exclusiveSource="Crunchyroll" />);
      const names = screen.getAllByTestId("source-name").map((n) => n.textContent);
      expect(names).toEqual(["動畫瘋", "Netflix", "Crunchyroll"]);
      expect(screen.getByTestId("source-tag")).toHaveTextContent("Crunchyroll");
    });
  });

  // A TV show's or cartoon's original source reads like an exclusive one: a
  // value with a main access row marks that row "(Original)" and leads the
  // section; a value with none is still a row at the top of the section, in
  // the same row style, never a boxed tag. The original source vocabulary is
  // far wider than the main sources, so the second case is the common one.
  describe("the original source of a TV show or cartoon", () => {
    const watch = [
      { system_id: "1", kind: "access", bucket: "main", name: "動畫瘋", url: "https://b.test", available: true },
      { system_id: "2", kind: "access", bucket: "main", name: "Disney+", url: "https://d.test", available: true },
      { system_id: "3", kind: "access", bucket: "other", name: "DramasQ", url: "https://q.test", available: null },
    ];

    it("marks a matching main row (Original) and puts it first", () => {
      render(
        <SourcesCard sources={watch} mediaType="tv-show" originalSource="Disney+" originalSourceAsAccess />,
      );
      const section = screen.getByRole("region", { name: "Where to Watch" });
      const names = within(section).getAllByTestId("source-name").map((n) => n.textContent);
      expect(names).toEqual(["Disney+ (Original)", "動畫瘋", "DramasQ"]);
      expect(screen.getByRole("link", { name: /disney\+ \(original\)/i })).toHaveAttribute(
        "href",
        "https://d.test",
      );
      expect(screen.queryByTestId("source-tag")).toBeNull();
    });

    it("draws a value with no main row as a row of its own, first, with its icon", () => {
      const { container } = render(
        <SourcesCard sources={watch} mediaType="cartoon" originalSource="Netflix, HBO Max" originalSourceAsAccess />,
      );
      const section = screen.getByRole("region", { name: "Where to Watch" });
      const names = within(section).getAllByTestId("source-name").map((n) => n.textContent);
      expect(names).toEqual(["Netflix (Original)", "HBO Max (Original)", "動畫瘋", "Disney+", "DramasQ"]);
      expect(screen.queryByTestId("source-tag")).toBeNull();
      // Same row style as a source: an icon slot, no box.
      const netflixRow = within(section).getByText("Netflix (Original)").closest("div");
      expect(netflixRow.querySelector("img")).not.toBeNull();
      expect(container.querySelector(".border-dashed, [data-testid='source-tag']")).toBeNull();
    });

    it("opens the Where to Watch section on its own when there are no access rows", () => {
      render(<SourcesCard sources={[]} mediaType="tv-show" originalSource="Netflix" originalSourceAsAccess />);
      const section = screen.getByRole("region", { name: "Where to Watch" });
      expect(within(section).getByText("Netflix (Original)")).toBeInTheDocument();
      expect(screen.queryByText("No sources recorded.")).toBeNull();
    });
  });

  // A manga's or book's serialization platform reads like an exclusive one:
  // it leads Where to Read marked "(連載平台)" - the matching main row when
  // the entry has one, otherwise a row of its own - and is never a tag. An
  // entry may name more than one.
  describe("the serialization platform of a manga or book", () => {
    const read = [
      { system_id: "1", kind: "access", bucket: "main", name: "Pixiv", url: "https://p.test", available: true },
      { system_id: "2", kind: "access", bucket: "main", name: "週刊少年Jump", url: "https://j.test", available: true },
      { system_id: "3", kind: "access", bucket: "restricted", name: "Elsewhere", url: "https://e.test" },
    ];

    it("marks the matching main row (連載平台) and puts it first", () => {
      render(<SourcesCard sources={read} mediaType="manga" serializationPlatform="週刊少年Jump" />);
      const section = screen.getByRole("region", { name: "Where to Read" });
      const names = within(section).getAllByTestId("source-name").map((n) => n.textContent);
      expect(names).toEqual(["週刊少年Jump (連載平台)", "Pixiv", "Elsewhere"]);
      expect(screen.getByRole("link", { name: /週刊少年Jump \(連載平台\)/ })).toHaveAttribute("href", "https://j.test");
      expect(screen.queryByTestId("source-tag")).toBeNull();
    });

    it("draws each of several platforms, matched or not, at the head of the section", () => {
      render(
        <SourcesCard sources={read} mediaType="book" serializationPlatform="カクヨム, 週刊少年Jump" />,
      );
      const section = screen.getByRole("region", { name: "Where to Read" });
      const names = within(section).getAllByTestId("source-name").map((n) => n.textContent);
      expect(names).toEqual(["カクヨム (連載平台)", "週刊少年Jump (連載平台)", "Pixiv", "Elsewhere"]);
      expect(screen.queryByTestId("source-tag")).toBeNull();
    });

    it("opens Where to Read on its own when there are no access rows", () => {
      render(<SourcesCard sources={[]} mediaType="manga" serializationPlatform="Pixiv" />);
      const section = screen.getByRole("region", { name: "Where to Read" });
      expect(within(section).getByText("Pixiv (連載平台)")).toBeInTheDocument();
    });
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
