// An item body is Markdown typed by an editor and read by everyone, so what
// matters is that links work, leave the site safely, and cannot run script.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ResourceMarkdown from "./ResourceMarkdown";

describe("ResourceMarkdown", () => {
  it("renders an inline link inside a sentence", () => {
    render(<ResourceMarkdown>{"Read [the guide](https://example.com/guide) first."}</ResourceMarkdown>);
    const link = screen.getByRole("link", { name: "the guide" });
    expect(link).toHaveAttribute("href", "https://example.com/guide");
    expect(link.closest("p")).toHaveTextContent("Read the guide first.");
  });

  it("opens links in a new tab without handing over the opener", () => {
    render(<ResourceMarkdown>{"[x](https://example.com)"}</ResourceMarkdown>);
    const link = screen.getByRole("link", { name: "x" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("autolinks a bare URL", () => {
    render(<ResourceMarkdown>{"See https://example.org/page for more"}</ResourceMarkdown>);
    expect(screen.getByRole("link", { name: "https://example.org/page" })).toHaveAttribute(
      "href",
      "https://example.org/page",
    );
  });

  it("does not render a javascript: link as an executable href", () => {
    const { container } = render(
      <ResourceMarkdown>{"[click me](javascript:alert(1))"}</ResourceMarkdown>,
    );
    // The mirror case: the same markup with a real URL does produce an href,
    // so an absent one here is the sanitiser's doing.
    const anchors = container.querySelectorAll("a");
    expect(anchors.length).toBeLessThanOrEqual(1);
    anchors.forEach((a) => {
      expect(a.getAttribute("href") || "").not.toMatch(/^\s*javascript:/i);
    });
    expect(container).toHaveTextContent("click me");
  });

  it("drops raw HTML rather than rendering it", () => {
    const { container } = render(
      <ResourceMarkdown>{'<img src="x" onerror="alert(1)"> <b>bold</b>'}</ResourceMarkdown>,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });
});
