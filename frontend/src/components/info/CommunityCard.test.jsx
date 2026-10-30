// What the public lists think of one entry.
//
// The sample size is the thing this component must never drop: an average of
// "A" over two ratings and an average of "A" over two hundred are different
// claims, and only one of them is worth reading.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CommunityCard from "./CommunityCard";

// The viewer's view.* scope. A member (every flag on) unless a test says
// otherwise; `scope.<flag> = false` makes the guest case.
const { scope } = vi.hoisted(() => ({
  scope: { entities: true, search: true, extras: true, personal: true },
}));
vi.mock("../../hooks/useViewScope", () => ({ useViewScope: () => scope }));
beforeEach(() => {
  Object.assign(scope, { entities: true, search: true, extras: true, personal: true });
});

const MEDIA_ID = "11111111-1111-1111-1111-111111111111";

function stub(body) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => body })),
  );
}

function renderCard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CommunityCard mediaId={MEDIA_ID} />
    </QueryClientProvider>,
  );
}

describe("CommunityCard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing when no public list holds the entry", async () => {
    stub({
      media_id: MEDIA_ID,
      list_count: 0,
      statuses: [],
      sample_size: 0,
      average_points: null,
      average_rating: null,
    });
    const { container } = renderCard();
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the entry is gated away", async () => {
    // The backend 404s a hidden entry and a non-existent one identically, so
    // this is the ONLY thing the card sees for either. It must stay silent
    // rather than render an error slip: an error where a hidden entry would be
    // tells the reader the entry exists, which is what the 404 is hiding.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 404,
        json: async () => ({ detail: "Entry not found." }),
      })),
    );
    const { container } = renderCard();
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a payload that is not an aggregate", async () => {
    // Nine detail pages mount this card, and a page whose stubbed fetch answers
    // something else must not be taken down by it.
    stub({ anime_name_en: "Something else entirely" });
    const { container } = renderCard();
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the per-status counts", async () => {
    stub({
      media_id: MEDIA_ID,
      list_count: 3,
      statuses: [
        { status: "Completed", count: 2 },
        { status: "Watching", count: 1 },
      ],
      sample_size: 2,
      average_points: 7.0,
      average_rating: "A+",
    });
    renderCard();
    expect(await screen.findByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Watching")).toBeInTheDocument();
  });

  it("shows the average beside its sample size", async () => {
    stub({
      media_id: MEDIA_ID,
      list_count: 3,
      statuses: [{ status: "Completed", count: 2 }],
      sample_size: 2,
      average_points: 7.0,
      average_rating: "A+",
    });
    renderCard();
    expect(await screen.findByText("A+")).toBeInTheDocument();
    expect(screen.getByText(/2 ratings/)).toBeInTheDocument();
  });

  it("omits the average when nobody rated it", async () => {
    stub({
      media_id: MEDIA_ID,
      list_count: 2,
      statuses: [{ status: "Watching", count: 2 }],
      sample_size: 0,
      average_points: null,
      average_rating: null,
    });
    renderCard();
    expect(await screen.findByText("Watching")).toBeInTheDocument();
    expect(screen.queryByText(/ratings/)).not.toBeInTheDocument();
  });
});

describe("CommunityCard without view.personal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // An aggregate that WOULD render for a member: the mirror case draws it, so
  // the empty card below is the key's doing and not the data's.
  const aggregate = {
    media_id: MEDIA_ID,
    list_count: 3,
    statuses: [{ status: "Completed", count: 3 }],
    sample_size: 3,
    average_points: 8,
    average_rating: "A",
  };

  it("renders nothing and never asks the server", async () => {
    scope.personal = false;
    stub(aggregate);
    const { container } = renderCard();
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("draws the same aggregate for a member", async () => {
    stub(aggregate);
    renderCard();
    expect(await screen.findByText("Completed")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalled();
  });
});
