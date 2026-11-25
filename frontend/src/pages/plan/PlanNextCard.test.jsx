// One planned thing on the Plan page, on both the Do next and To redo tabs.
//
// A series or franchise row names its tier at the cover's top left; an entry
// row carries no badge. The name takes two lines, and every card reserves
// both, so a row of cards lines up whether a title wraps or not.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import PlanNextCard from "./PlanNextCard";
import PlanToRewatch from "./PlanToRewatch";
import PlanWatchNext from "./PlanWatchNext";
import { entryBucket } from "../../utils/planNext";

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ has: () => true, user: { username: "u" } }),
}));

const NAV = {
  anime: "/anime",
  movie: "/movie",
  "tv-show": "/tv-show",
  cartoon: "/cartoon",
  comic: "/comic",
  book: "/book",
  game: "/game",
};

function row(mediaType, scope, kind, name, extra = {}) {
  return {
    system_id: `${kind}-${mediaType}-${scope}-${name}`,
    kind,
    media_type: mediaType,
    scope,
    target_id: `t-${name}`,
    display_name: name,
    nav_path: NAV[mediaType],
    missing: false,
    bucket: null,
    ...extra,
  };
}

function renderWith(ui) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const TAB_LABEL = {
  anime: "Anime",
  movie: "Movie",
  "tv-show": "TV Show",
  cartoon: "Cartoon",
  comic: "Comic",
  book: "Book",
  game: "Game",
};

// The badge reads off the card's cover; an entry row on the same tab is the
// mirror, so a badge on every card would fail.
async function expectTierBadges(Section, kind, mediaType, scope) {
  const user = userEvent.setup();
  const label = scope === "series" ? "Series" : "Franchise";
  renderWith(
    <Section
      planRows={[
        row(mediaType, scope, kind, "Group Row"),
        row(mediaType, "entry", kind, "Entry Row"),
      ]}
    />,
  );
  if (mediaType !== "anime") {
    await user.click(screen.getByRole("button", { name: TAB_LABEL[mediaType] }));
  }
  const groupCard = screen.getByText("Group Row").closest("a");
  const entryCard = screen.getByText("Entry Row").closest("a");
  expect(within(groupCard).getByText(label)).toBeInTheDocument();
  expect(within(entryCard).queryByText("Series")).toBeNull();
  expect(within(entryCard).queryByText("Franchise")).toBeNull();
}

describe("the tier badge on a group row", () => {
  it.each([
    ["anime", "series"],
    ["anime", "franchise"],
    ["movie", "series"],
    ["movie", "franchise"],
    ["tv-show", "series"],
    ["tv-show", "franchise"],
    ["cartoon", "series"],
    ["cartoon", "franchise"],
    ["comic", "series"],
  ])("Do next: %s %s", (mediaType, scope) =>
    expectTierBadges(PlanWatchNext, "next", mediaType, scope),
  );

  it.each([
    ["movie", "series"],
    ["movie", "franchise"],
    ["tv-show", "series"],
    ["tv-show", "franchise"],
    ["comic", "series"],
    ["book", "series"],
    ["book", "franchise"],
    ["game", "series"],
    ["game", "franchise"],
  ])("To redo: %s %s", (mediaType, scope) =>
    expectTierBadges(PlanToRewatch, "rewatch", mediaType, scope),
  );
});

describe("the name", () => {
  it("takes two lines and reserves both", () => {
    renderWith(<PlanNextCard row={row("movie", "entry", "next", "A Long Title")} />);
    const name = screen.getByText("A Long Title");
    expect(name.className).toContain("line-clamp-2");
    expect(name.className).not.toContain("truncate");
    expect(name.className).toMatch(/min-h-\[/);
    expect(name).toHaveAttribute("title", "A Long Title");
  });
});

describe("the platform picker", () => {
  it("is on a queued h-game, as on a game", () => {
    renderWith(
      <PlanNextCard row={row("h-game", "entry", "next", "Some H-Game", { nav_path: "/h-game" })} />,
    );
    expect(
      screen.getByRole("combobox", { name: /platform group for some h-game/i }),
    ).toBeInTheDocument();
  });

  it("is on no replay mark", () => {
    renderWith(<PlanNextCard row={row("game", "entry", "rewatch", "Replay Me")} />);
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});

describe("the anime tab's groups", () => {
  const sized = (bucket) => ({ bucket });

  it("draws the size buckets, then Movie, then Others, then the ungrouped pile", () => {
    renderWith(
      <PlanWatchNext
        planRows={[
          row("anime", "entry", "next", "Unsized TV", sized(entryBucket("anime", "TV"))),
          row("anime", "entry", "next", "An OVA", sized(entryBucket("anime", "OVA"))),
          row("anime", "entry", "next", "A Film", sized(entryBucket("anime", "Movie"))),
          row("anime", "entry", "next", "Short", sized("12ep")),
          row("anime", "franchise", "next", "Unsized Franchise", sized("others")),
        ]}
      />,
    );
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(["12 EP", "Movie", "Others", "Ungrouped"]);
  });
});
