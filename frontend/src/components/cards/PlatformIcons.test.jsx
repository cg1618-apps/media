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

  it("renders nothing when no platform is available", () => {
    const { container } = render(
      <PlatformIcons sources={[main("Netflix", { available: null })]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
