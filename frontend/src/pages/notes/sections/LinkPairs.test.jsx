// Frontend: tests for the titled-link editor and read view.
//
// What these pin: a link with a title reads as text - body-sized, not the
// small mono tag a bare host gets - and is never cut to a fixed width, so a
// long title shows as much as the row has room for. In the editor the title
// sits above the URL rather than beside it, since a title is usually the
// longer of the two.
import { render, screen } from "@testing-library/react";

import { LinkPairPills, LinkPairsEditor } from "./LinkPairs";

const LONG_TITLE =
  "【完整版】第三季全集解說 - 從第一話到最終話的所有伏筆與彩蛋整理";

test("a titled link reads as body text, not as a mono tag", () => {
  render(<LinkPairPills links={[{ text: "Official site", url: "https://a.example" }]} />);
  const link = screen.getByRole("link", { name: /Official site/ });
  expect(link).toHaveClass("text-sm");
  expect(link).not.toHaveClass("font-mono");
});

test("a long title is not cut to a fixed width", () => {
  render(<LinkPairPills links={[{ text: LONG_TITLE, url: "https://a.example" }]} />);
  const link = screen.getByRole("link", { name: new RegExp(LONG_TITLE.slice(0, 8)) });
  expect(link.className).not.toMatch(/max-w-\[/);
  expect(link).not.toHaveClass("truncate");
  expect(link).toHaveTextContent(LONG_TITLE);
});

test("a link without a title keeps the small host tag", () => {
  render(<LinkPairPills links={[{ text: null, url: "https://host.example/x" }]} />);
  const link = screen.getByRole("link", { name: /host\.example/ });
  expect(link).toHaveClass("font-mono");
});

test("the editor puts the title above the URL, at full width", () => {
  render(<LinkPairsEditor pairs={[{ text: "", url: "" }]} onChange={() => {}} />);
  const title = screen.getByLabelText("Link text");
  const url = screen.getByLabelText("Link URL");
  // Title first in document order, and not squeezed into a fixed column.
  expect(title.compareDocumentPosition(url) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(title.className).not.toMatch(/sm:w-40/);
  // The row stacks at every width - no side-by-side breakpoint.
  expect(title.parentElement.className).not.toMatch(/sm:flex-row/);
});
