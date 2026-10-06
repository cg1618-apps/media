// The entry cards' platform icons: every available main access row that has
// an icon, linked when it carries a url.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PlatformIcons, { availablePlatforms } from "./PlatformIcons";

const main = (name, extra = {}) => ({
  system_id: name,
  kind: "access",
  bucket: "main",
  name,
  available: true,
  ...extra,
});

describe("availablePlatforms", () => {
  it("keeps available main access rows that have an icon, in server order", () => {
    const names = availablePlatforms([
      main("Netflix"),
      main("動畫瘋"),
      main("Disney+", { available: false }),
      main("Cinema"),
      main("Wikipedia", { kind: "reference" }),
      main("Crunchyroll", { bucket: "restricted" }),
    ]).map(({ row }) => row.name);
    expect(names).toEqual(["Netflix", "動畫瘋"]);
  });

  it("draws regional variants that share an icon once", () => {
    const platforms = availablePlatforms([
      main("Toptoon TW"),
      main("Lezhin KR"),
      main("Toptoon KR"),
    ]);
    expect(platforms.map(({ row }) => row.name)).toEqual(["Toptoon TW", "Lezhin KR"]);
    expect(platforms[0].names).toEqual(["Toptoon TW", "Toptoon KR"]);
  });

  it("keeps the variant that carries a url when only a later one does", () => {
    const [toptoon] = availablePlatforms([
      main("Toptoon TW"),
      main("Toptoon KR", { url: "https://kr.test" }),
    ]);
    expect(toptoon.row.name).toBe("Toptoon KR");
  });
});

describe("PlatformIcons", () => {
  it("links an icon whose row has a url", () => {
    render(<PlatformIcons sources={[main("Netflix", { url: "https://n.test" })]} />);
    expect(screen.getByAltText("Netflix").closest("a")).toHaveAttribute(
      "href",
      "https://n.test",
    );
  });

  it("does not link when told not to", () => {
    render(
      <PlatformIcons
        sources={[main("Netflix", { url: "https://n.test" })]}
        linked={false}
      />,
    );
    expect(screen.getByAltText("Netflix").closest("a")).toBeNull();
  });

  it("draws Toptoon once when an entry has both TW and KR", () => {
    render(<PlatformIcons sources={[main("Toptoon TW"), main("Toptoon KR")]} />);
    const icons = screen.getAllByRole("img");
    expect(icons).toHaveLength(1);
    expect(icons[0].closest("[title]")).toHaveAttribute(
      "title",
      "Toptoon TW / Toptoon KR (no link)",
    );
  });

  it("renders nothing when no platform is available", () => {
    const { container } = render(
      <PlatformIcons sources={[main("Netflix", { available: null })]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
