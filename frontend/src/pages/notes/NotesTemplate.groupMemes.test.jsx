// Frontend: the series' and franchise's memes on an entry's Memes card.
//
// Memes are an `external` section - their rows live in the meme table and come
// from /api/meme, not /api/notes - so the series' and franchise's notes never
// carry them. The entry's Memes card fetches them itself, by owner, and shows
// them after the entry's own memes under the same "From series / From
// franchise" headings every other section's group rows wear: read-only, no
// Edit, Delete or favourite toggle.
//
// The "no write controls" assertions only bite because the entry's own memes
// in the same card DO carry them: the viewer holds manage.catalog and the
// favourites feature, so Edit, Delete and the star are there to be missing.
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import NotesTemplate from "./NotesTemplate";
import * as api from "./api";

vi.mock("./api");
const { auth } = vi.hoisted(() => ({
  auth: { features: ["quotes_memes", "favourites"] },
}));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    has: (p) => p === "manage.catalog",
    hasFeature: (feature) => auth.features.includes(feature),
  }),
}));
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast: () => {} }),
}));

// The entry's own memes come through MemeSection's own query.
const OWN_MEMES = [
  { system_id: "m1", text: "own meme one" },
  { system_id: "m2", text: "own meme two" },
];
const fetchJson = vi.fn();
vi.mock("../../api/client", () => ({
  fetchJson: (...args) => fetchJson(...args),
  jsonBody: (body) => ({ body: JSON.stringify(body) }),
  buildUrl: (url) => url,
}));

const SECTIONS = [{ key: "memes", shape: "external", label: "梗/迷因 Memes", kinds: [] }];

const SERIES = { system_id: "s-id", public_id: 7, series_name_cn: "進擊系列" };
const FRANCHISE = { system_id: "f-id", public_id: 3, franchise_name_cn: "進擊的巨人" };

const memesFor = {
  series: [
    { system_id: "sm1", text: "series meme one", is_favorite: true },
    { system_id: "sm2", text: "series meme two" },
  ],
  franchise: [{ system_id: "fm1", text: "franchise meme one" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.features = ["quotes_memes", "favourites"];
  fetchJson.mockImplementation(async () => OWN_MEMES);
  vi.mocked(api.fetchSections).mockResolvedValue(SECTIONS);
  vi.mocked(api.fetchNotes).mockResolvedValue([]);
  vi.mocked(api.fetchMemes).mockImplementation(async (ownerType) => memesFor[ownerType]);
});

const renderTemplate = (props = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <NotesTemplate ownerType="anime" ownerId="abc" {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const cardOf = (label) => screen.getByText(label).closest("div.bg-surface");

describe("group memes on an entry", () => {
  it("shows the series' then the franchise's memes after the entry's own, labelled", async () => {
    renderTemplate({ series: SERIES, franchise: FRANCHISE });
    await screen.findByText("franchise meme one");
    await screen.findByText("own meme one");
    const card = cardOf("梗/迷因 Memes");
    const fromSeries = within(card).getByRole("group", { name: "From series: 進擊系列" });
    const fromFranchise = within(card).getByRole("group", { name: "From franchise: 進擊的巨人" });
    expect(within(fromSeries).getByText("series meme one")).toBeInTheDocument();
    expect(within(fromSeries).getByText("series meme two")).toBeInTheDocument();
    expect(within(fromFranchise).getByText("franchise meme one")).toBeInTheDocument();

    const order = [
      "own meme one",
      "own meme two",
      "series meme one",
      "series meme two",
      "franchise meme one",
    ].map((text) => screen.getByText(text));
    for (let i = 1; i < order.length; i += 1) {
      expect(
        order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(api.fetchMemes).toHaveBeenCalledWith("series", "s-id");
    expect(api.fetchMemes).toHaveBeenCalledWith("franchise", "f-id");
    // The card counts every meme it shows: two own, three of the groups'.
    expect(within(card).getByText("5")).toBeInTheDocument();
  });

  it("gives the group's memes no edit, delete or favourite toggle, while the entry's own have them", async () => {
    renderTemplate({ series: SERIES, franchise: FRANCHISE });
    await screen.findByText("franchise meme one");
    await screen.findByText("own meme one");
    const card = cardOf("梗/迷因 Memes");

    // The mirror case: the entry's own memes in this very card are writable.
    expect(within(card).getAllByRole("button", { name: "Edit" })).toHaveLength(2);
    expect(within(card).getAllByRole("button", { name: "Delete" })).toHaveLength(2);
    expect(within(card).getAllByRole("button", { name: "Add to favourites" })).toHaveLength(2);

    for (const name of ["From series: 進擊系列", "From franchise: 進擊的巨人"]) {
      const group = within(card).getByRole("group", { name });
      expect(within(group).queryByRole("button")).toBeNull();
    }
    // A favourite of the viewer's still reads as one, without a toggle.
    const fromSeries = within(card).getByRole("group", { name: "From series: 進擊系列" });
    expect(within(fromSeries).getByRole("img", { name: "Favourite" })).toBeInTheDocument();
  });

  it("opens the card on the group's memes when the entry has none of its own", async () => {
    fetchJson.mockImplementation(async () => []);
    renderTemplate({ franchise: FRANCHISE });
    expect(await screen.findByText("franchise meme one")).toBeInTheDocument();
    const card = cardOf("梗/迷因 Memes");
    expect(within(card).queryByText("No entries.")).toBeNull();
    expect(api.fetchMemes).not.toHaveBeenCalledWith("series", expect.anything());
  });

  it("fetches no group memes for an account without the quotes_memes switch", async () => {
    auth.features = [];
    renderTemplate({ series: SERIES, franchise: FRANCHISE });
    await waitFor(() => expect(api.fetchNotes).toHaveBeenCalled());
    await waitFor(() => expect(api.fetchSections).toHaveBeenCalled());
    expect(api.fetchMemes).not.toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: /^From / })).toBeNull();
  });

  it("fetches no group memes for a screen that passes no series or franchise", async () => {
    renderTemplate();
    await screen.findByText("own meme one");
    expect(api.fetchMemes).not.toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: /^From / })).toBeNull();
  });
});
