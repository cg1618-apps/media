// Frontend: the collection, franchise and series forms lay their names out as
// an entry form does (EntryNameFields) - CN beside EN, Romaji beside JP, Alt
// across the card - on Add and Modify alike.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CollectionAddTab from "./CollectionAddTab";
import FranchiseAddTab from "./FranchiseAddTab";
import SeriesAddTab from "./SeriesAddTab";
import CollectionModifyTab from "../modify-tabs/CollectionModifyTab";
import FranchiseModifyTab from "../modify-tabs/FranchiseModifyTab";
import SeriesModifyTab from "../modify-tabs/SeriesModifyTab";

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ has: () => true, visibleGatedTypes: [] }),
}));
vi.mock("../../components/info/RelatedRecords", () => ({ default: () => null }));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [] })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mount(node) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

const rowOf = (name) => screen.getByRole("textbox", { name }).closest(".grid");

const noop = () => {};
const lists = {
  allAnime: [],
  allAnimeMovies: [],
  allMovies: [],
  allTvShows: [],
  allCartoons: [],
  allMangas: [],
  allBooks: [],
  allComics: [],
};

const FORMS = [
  ["Collection", "Add", () => <CollectionAddTab cf={{}} uf={noop} />],
  ["Collection", "Modify", () => <CollectionModifyTab cf={{}} uf={noop} allFranchises={[]} />],
  ["Franchise", "Add", () => <FranchiseAddTab ff={{}} uf={noop} collectionItems={[]} />],
  [
    "Franchise",
    "Modify",
    () => <FranchiseModifyTab ff={{}} uf={noop} collectionItems={[]} editingItem={null} {...lists} />,
  ],
  ["Series", "Add", () => <SeriesAddTab sf={{}} us={noop} franchiseItems={[]} />],
  [
    "Series",
    "Modify",
    () => <SeriesModifyTab sf={{}} us={noop} franchiseItems={[]} editingItem={null} {...lists} />,
  ],
];

describe.each(FORMS)("%s %s names", (tier, _page, form) => {
  it("lays out cn | en, romaji | jp, then alt full width", () => {
    mount(form());
    const name = (suffix) => `${tier} Name ${suffix}`;
    expect(rowOf(name("CN"))).toBe(rowOf(name("EN")));
    expect(rowOf(name("Romaji"))).toBe(rowOf(name("JP")));
    expect(rowOf(name("CN"))).not.toBe(rowOf(name("Romaji")));
    expect(rowOf(name("Alt"))).toBeNull();
  });
});
