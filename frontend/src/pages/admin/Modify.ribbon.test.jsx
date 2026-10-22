// Frontend: every media editor on Modify shows the entry's franchise siblings
// in the shared FranchiseRibbon, ABOVE the editor card, and a chip opens that
// sibling's editor. Movie hides the ribbon for its catch-all franchises, whose
// "siblings" are unrelated films.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Modify from "./Modify";
import * as notesApi from "../notes/api";

vi.mock("../notes/api");
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    has: () => true,
    visibleGatedTypes: [],
    user: { username: "admin" },
  }),
}));

const RIBBON_TITLE = "Other entries in this franchise";

const ok = (body) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

// A franchise that is not one of Movie's catch-alls, so every type's ribbon
// has something to show; the catch-all case below swaps only its name.
const FRANCHISE = { system_id: "f1", franchise_name_cn: "系列" };

function mount({ type, listPath, entries, franchises = [FRANCHISE] }) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url, options = {}) => {
      const u = String(url);
      if ((options.method || "GET") === "GET") {
        if (u.startsWith(`${listPath}/?`)) return ok(entries);
        if (u.startsWith("/api/franchise/?")) return ok(franchises);
      }
      return ok([]);
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter
        initialEntries={[`/modify?type=${type}&id=${entries[0].system_id}`]}
      >
        <Modify />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// The editor card is the box holding the entry's own heading.
async function editorCard() {
  const save = await screen.findByRole("button", { name: /save changes/i });
  return save
    .closest("form")
    .querySelector(".bg-surface.rounded-2xl.border");
}

beforeEach(() => {
  vi.mocked(notesApi.fetchSections).mockResolvedValue([]);
  vi.mocked(notesApi.fetchNotes).mockResolvedValue([]);
  return () => vi.unstubAllGlobals();
});

const CASES = [
  ["anime", "/api/anime", "anime_name_cn"],
  ["anime-movie", "/api/anime-movie", "anime_movie_name_cn"],
  ["movie", "/api/movies", "movie_name_cn"],
  ["tv-show", "/api/tv-shows", "tv_name_cn"],
  ["cartoon", "/api/cartoon", "cartoon_name_cn"],
  ["manga", "/api/manga", "manga_name_cn"],
  ["novel", "/api/novel", "novel_name_cn"],
  ["comic", "/api/comic", "comic_name_cn"],
  ["game", "/api/game", "game_name_cn"],
];

describe("Modify franchise ribbon", () => {
  it.each(CASES)(
    "%s shows its siblings above the editor card",
    async (type, listPath, nameKey) => {
      mount({
        type,
        listPath,
        entries: [
          { system_id: "self", franchise_id: "f1", [nameKey]: "本作" },
          { system_id: "sib", franchise_id: "f1", [nameKey]: "兄弟作" },
          { system_id: "other", franchise_id: "f2", [nameKey]: "別作" },
        ],
      });
      const card = await editorCard();
      const title = await screen.findByText(RIBBON_TITLE);
      const ribbon = title.parentElement;
      expect(card.contains(ribbon)).toBe(false);
      expect(
        ribbon.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        within(ribbon).getByRole("button", { name: "兄弟作" }),
      ).toBeInTheDocument();
      expect(within(ribbon).queryByText("別作")).not.toBeInTheDocument();
      expect(within(ribbon).queryByText("本作")).not.toBeInTheDocument();
    },
  );

  it("opens the sibling's editor from its chip", async () => {
    const user = userEvent.setup();
    mount({
      type: "manga",
      listPath: "/api/manga",
      entries: [
        { system_id: "self", franchise_id: "f1", manga_name_cn: "本作" },
        { system_id: "sib", franchise_id: "f1", manga_name_cn: "兄弟作" },
      ],
    });
    await user.click(await screen.findByRole("button", { name: "兄弟作" }));
    expect(await screen.findByText("sib")).toBeInTheDocument();
  });

  it("badges an anime sibling with its airing type", async () => {
    mount({
      type: "anime",
      listPath: "/api/anime",
      entries: [
        { system_id: "self", franchise_id: "f1", anime_name_cn: "本作" },
        {
          system_id: "sib",
          franchise_id: "f1",
          anime_name_cn: "兄弟作",
          airing_type: "OVA",
        },
      ],
    });
    const ribbon = (await screen.findByText(RIBBON_TITLE)).parentElement;
    expect(
      within(ribbon).getByRole("button", { name: /OVA\s*兄弟作/ }),
    ).toBeInTheDocument();
  });

  it("hides the movie ribbon in a catch-all franchise", async () => {
    mount({
      type: "movie",
      listPath: "/api/movies",
      franchises: [{ ...FRANCHISE, franchise_name_cn: "獨立電影" }],
      entries: [
        { system_id: "self", franchise_id: "f1", movie_name_cn: "本作" },
        { system_id: "sib", franchise_id: "f1", movie_name_cn: "兄弟作" },
      ],
    });
    // A deep link opens the editor only once the franchise list has landed,
    // so the exclusion has been decided by the time the card is up. The
    // movie case above is the mirror: same entries, ordinary franchise name.
    await editorCard();
    expect(screen.queryByText(RIBBON_TITLE)).not.toBeInTheDocument();
  });
});
