// Frontend: the Quotes and Memes note sections are extras (view.extras).
//
// They are backed by /api/quote and /api/meme, which answer 401 to a viewer
// without the key, so for such a viewer they are dropped before they render -
// and before their components could fetch. The registry below lists both, and
// the member case draws both from it, so their absence for a guest is the
// key's doing.
import { render, screen, waitFor } from "@testing-library/react";

import NotesTemplate from "./NotesTemplate";
import * as api from "./api";

vi.mock("./api");
vi.mock("./sections/QuoteSection", () => ({
  default: ({ label }) => <div data-testid="quote-section">{label}</div>,
}));
vi.mock("./sections/MemeSection", () => ({
  default: ({ label }) => <div data-testid="meme-section">{label}</div>,
}));
const { scope } = vi.hoisted(() => ({
  scope: { entities: true, search: true, extras: true, personal: true },
}));
vi.mock("../../hooks/useViewScope", () => ({ useViewScope: () => scope }));

const SECTIONS = [
  { key: "overview", shape: "text", label: "Overview", kinds: [] },
  { key: "quotes", shape: "external", label: "Quotes", kinds: [] },
  { key: "memes", shape: "external", label: "Memes", kinds: [] },
];

beforeEach(() => {
  scope.extras = true;
  vi.mocked(api.fetchSections).mockResolvedValue(SECTIONS);
  vi.mocked(api.fetchNotes).mockResolvedValue([
    { system_id: "n1", section: "overview", content: "an overview", sort_index: 0 },
  ]);
});

const renderTemplate = () =>
  render(<NotesTemplate ownerType="anime" ownerId="abc" isAdmin={false} />);

describe("NotesTemplate quotes and memes", () => {
  it("leaves both out for a viewer without view.extras", async () => {
    scope.extras = false;
    renderTemplate();
    // The page has loaded once the overview row shows.
    await waitFor(() => expect(screen.getByText("an overview")).toBeInTheDocument());
    expect(screen.queryByTestId("quote-section")).toBeNull();
    expect(screen.queryByTestId("meme-section")).toBeNull();
  });

  it("draws both for a member", async () => {
    renderTemplate();
    expect(await screen.findByTestId("quote-section")).toBeInTheDocument();
    expect(screen.getByTestId("meme-section")).toBeInTheDocument();
  });
});
