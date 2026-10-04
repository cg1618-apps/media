// Frontend: the Add tab's external search box - one component for MAL, TMDB,
// Open Library, Comic Vine and IGDB, all answering ExternalSearchResult rows.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ExternalSearchBox, { EXTERNAL_SEARCH_DEBOUNCE_MS } from "./ExternalSearchBox";

const FRIEREN = {
  external_id: "52991",
  link: "https://myanimelist.net/anime/52991",
  title: "Sousou no Frieren",
  title_alt: "Frieren: Beyond Journey's End",
  year: 2023,
  detail: "TV · 28 eps",
  cover_url: "https://cdn.myanimelist.net/images/anime/1015/138006.jpg",
};
const NO_COVER = { ...FRIEREN, external_id: "1", title: "Frieren Shorts", cover_url: null };

const searchUrl = (q, limit) => `/api/anime/search-mal?q=${encodeURIComponent(q)}&limit=${limit}`;

function answer(body, { ok = true, status = 200 } = {}) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(body) });
}

function renderBox(props = {}) {
  const onPick = vi.fn();
  render(
    <ExternalSearchBox source="MAL" searchUrl={searchUrl} onPick={onPick} {...props} />,
  );
  return onPick;
}

const box = (source = "MAL") => screen.getByRole("textbox", { name: `Search ${source}` });
const settle = () =>
  new Promise((resolve) => setTimeout(resolve, EXTERNAL_SEARCH_DEBOUNCE_MS + 100));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => answer([FRIEREN, NO_COVER])));
});

describe("ExternalSearchBox", () => {
  it("fetches once the typing settles, with the source's URL", async () => {
    const user = userEvent.setup();
    renderBox();

    await user.type(box(), "frieren");

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/anime/search-mal?q=frieren&limit=10",
        expect.objectContaining({ credentials: "include" }),
      ),
    );
    // Debounced: seven keystrokes are one request, not seven.
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("fires nothing under two characters", async () => {
    const user = userEvent.setup();
    renderBox();

    await user.type(box(), "f");
    await settle();

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("renders each row's cover, titles, year and detail", async () => {
    const user = userEvent.setup();
    renderBox();

    await user.type(box(), "frieren");

    const row = await screen.findByRole("option", { name: /Sousou no Frieren/ });
    expect(row).toHaveTextContent("Frieren: Beyond Journey's End");
    expect(row).toHaveTextContent("2023");
    expect(row).toHaveTextContent("TV · 28 eps");
    const cover = screen.getByAltText("Sousou no Frieren");
    expect(cover).toHaveAttribute("src", FRIEREN.cover_url);
    expect(cover).toHaveAttribute("data-focus", "none");
    // A row with no cover still renders, over a placeholder block.
    expect(screen.getByRole("option", { name: /Frieren Shorts/ })).toBeInTheDocument();
    expect(screen.queryByAltText("Frieren Shorts")).not.toBeInTheDocument();
  });

  it("hands the picked row over, then clears itself", async () => {
    const user = userEvent.setup();
    const onPick = renderBox();

    await user.type(box(), "frieren");
    await user.click(await screen.findByRole("option", { name: /Sousou no Frieren/ }));

    expect(onPick).toHaveBeenCalledWith(FRIEREN);
    expect(box()).toHaveValue("");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("shows a 502's detail rather than 'no matches'", async () => {
    global.fetch.mockImplementation(() =>
      answer(
        { detail: "MyAnimeList search (Tenrai) is unreachable." },
        { ok: false, status: 502 },
      ),
    );
    const user = userEvent.setup();
    renderBox();

    await user.type(box(), "frieren");

    expect(
      await screen.findByText("MyAnimeList search (Tenrai) is unreachable."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No matches/)).not.toBeInTheDocument();
  });

  it("shows a generic line when the request never reaches the server", async () => {
    global.fetch.mockImplementation(() => Promise.reject(new TypeError("Failed to fetch")));
    const user = userEvent.setup();
    renderBox();

    await user.type(box(), "frieren");

    expect(await screen.findByText(/Could not reach the MAL search/)).toBeInTheDocument();
    expect(screen.queryByText(/No matches/)).not.toBeInTheDocument();
  });

  it("says 'No matches' for a genuine empty answer", async () => {
    global.fetch.mockImplementation(() => answer([]));
    const user = userEvent.setup();
    renderBox();

    await user.type(box(), "zzzz");

    expect(await screen.findByText("No matches on MAL")).toBeInTheDocument();
  });

  describe("submitOnEnter", () => {
    const comicUrl = (q, limit) =>
      `/api/comic/search-comicvine?q=${encodeURIComponent(q)}&limit=${limit}`;

    it("does not fetch while typing, and searches on Enter", async () => {
      const user = userEvent.setup();
      renderBox({ source: "Comic Vine", searchUrl: comicUrl, submitOnEnter: true });

      await user.type(box("Comic Vine"), "saga");
      await settle();

      expect(global.fetch).not.toHaveBeenCalled();
      expect(screen.getByText(/Press Enter to search Comic Vine/)).toBeInTheDocument();

      await user.keyboard("{Enter}");

      await waitFor(() =>
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/comic/search-comicvine?q=saga&limit=10",
          expect.objectContaining({ credentials: "include" }),
        ),
      );
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(await screen.findByRole("option", { name: /Sousou no Frieren/ })).toBeInTheDocument();
    });

    it("never lets Enter submit the surrounding form", async () => {
      const onSubmit = vi.fn((e) => e.preventDefault());
      const user = userEvent.setup();
      render(
        <form onSubmit={onSubmit}>
          <ExternalSearchBox
            source="Comic Vine"
            searchUrl={comicUrl}
            onPick={() => {}}
            submitOnEnter
          />
        </form>,
      );

      await user.type(box("Comic Vine"), "saga{Enter}");

      expect(onSubmit).not.toHaveBeenCalled();
    });
  });
});
