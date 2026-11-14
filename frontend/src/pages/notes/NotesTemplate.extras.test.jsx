// Frontend: the Quotes and Memes note sections follow the account's
// quotes_memes feature switch.
//
// They are backed by /api/quote and /api/meme, which answer 401 to an account
// without the switch, so for such a viewer they are dropped before they
// render - and before their components could fetch. The registry below lists
// both, and the switched-on case draws both from it, so their absence is the
// switch's doing. view.extras is held throughout: it no longer decides.
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
const { auth } = vi.hoisted(() => ({ auth: { features: [] } }));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    has: () => true,
    hasFeature: (feature) => auth.features.includes(feature),
  }),
}));

const SECTIONS = [
  { key: "overview", shape: "text", label: "Overview", kinds: [] },
  { key: "quotes", shape: "external", label: "Quotes", kinds: [] },
  { key: "memes", shape: "external", label: "Memes", kinds: [] },
];

beforeEach(() => {
  auth.features = ["quotes_memes"];
  vi.mocked(api.fetchSections).mockResolvedValue(SECTIONS);
  vi.mocked(api.fetchNotes).mockResolvedValue([
    { system_id: "n1", section: "overview", content: "an overview", sort_index: 0 },
  ]);
});

const renderTemplate = () =>
  render(<NotesTemplate ownerType="anime" ownerId="abc" />);

describe("NotesTemplate quotes and memes", () => {
  it("leaves both out for an account without the switch", async () => {
    auth.features = [];
    renderTemplate();
    // The page has loaded once the overview row shows.
    await waitFor(() => expect(screen.getByText("an overview")).toBeInTheDocument());
    expect(screen.queryByTestId("quote-section")).toBeNull();
    expect(screen.queryByTestId("meme-section")).toBeNull();
  });

  it("draws both for an account with the switch", async () => {
    renderTemplate();
    expect(await screen.findByTestId("quote-section")).toBeInTheDocument();
    expect(screen.getByTestId("meme-section")).toBeInTheDocument();
  });
});
