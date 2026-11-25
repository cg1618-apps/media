// Anime detail page — cast section (Task 10): a read-only rendering of
// useCasting's rows, following Book.test.jsx's setup (providers, mocking,
// router wrapping).
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../../contexts/AuthContext";
import { ToastProvider } from "../../hooks/useToast";
import Anime from "./Anime";

const BASE_ANIME = {
  system_id: "a1",
  anime_name_cn: "測試動畫",
  anime_name_en: "Test Anime",
  anime_name_roman: null,
  franchise_id: null,
  series_id: null,
  airing_type: "TV",
  airing_status: "Finished",
  release_season: null,
  release_date_jp: null,
  release_date_tw: null,
  runtime_min: null,
  watching_status: "Watching",
  ep_fin: 1,
  ep_total: 12,
  my_rating: null,
  cover_image_file: null,
};

function respond(url, isAdmin) {
  const u = String(url);
  if (u.startsWith("/api/auth/me")) {
    return {
      is_admin: isAdmin,
      // The catalogue editor is super: is_admin is manage.catalog, which the
      // admin role does not hold.
      username: isAdmin ? "cg1618" : "reader",
      role: isAdmin ? "super" : "user",
      // A member's keys: entity names link (the four entity keys). The guest
      // view is pinned in CastSection.test, StudioLinks.test and Book's own
      // guest case below.
      permissions: [
        "view.studio",
        "view.publisher",
        "view.person",
        "view.character",
        "view.search",
        "view.random_picker",
        ...(isAdmin ? ["manage.catalog"] : []),
      ],
    };
  }
  return [];
}

function mockFetch(anime, cast, { isAdmin = false } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => {
      const u = String(url);
      if (u.startsWith("/api/casting/anime/a1")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ cast }),
        });
      }
      if (u.startsWith("/api/anime/a1")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(anime),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(respond(u, isAdmin)),
      });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={["/anime/a1"]}>
            <Routes>
              <Route path="/anime/:publicId/:slug?" element={<Anime />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Anime detail page — cast", () => {
  it("renders the cast with links to the character and the seiyuu", async () => {
    mockFetch(BASE_ANIME, [
      {
        system_id: "cc1",
        character_id: "char-1",
        character_public_id: 1,
        character_name: "Protagonist",
        voices: [{ person_id: "person-1", person_public_id: 1, person_name: "Seiyuu One", remark: null }],
        role: "Main",
        position: 0,
        photo_file: "cc1.jpg",
        remark: null,
      },
    ]);
    mount();

    const characterLink = await screen.findByRole("link", { name: "Protagonist" });
    expect(characterLink).toHaveAttribute("href", "/character/1/protagonist");

    const seiyuuLink = await screen.findByRole("link", { name: "Seiyuu One" });
    expect(seiyuuLink).toHaveAttribute("href", "/person/1/seiyuu-one");
  });

  // The server resolves display_photo_file (the casting's own photo, falling
  // back to the character's portrait) before it ever reaches the frontend — this
  // asserts the component renders whatever display_photo_file the server sent, not
  // that the frontend chose or computed a fallback itself.
  it("renders whatever display_photo_file the server already resolved, including a character-portrait fallback", async () => {
    mockFetch(BASE_ANIME, [
      {
        system_id: "cc1",
        character_id: "char-1",
        character_public_id: 1,
        character_name: "Protagonist",
        voices: [],
        role: "Main",
        position: 0,
        // No casting-specific photo was set — this is the server's resolved
        // fallback value (the character's own portrait file), not something
        // the frontend derives.
        display_photo_file: "character-portrait.jpg",
        remark: null,
      },
    ]);
    mount();

    // The cast photo is decorative (alt=""), so it carries no accessible
    // name testing-library's role queries can match — assert on the <img>
    // itself once the character it belongs to has rendered.
    await screen.findByRole("link", { name: "Protagonist" });
    const img = document.querySelector('img[src*="character-portrait.jpg"]');
    // getCoverUrl() on localhost resolves to /api/covers/<file>.
    expect(img).not.toBeNull();
  });

  it("renders no cast section when the entry has an empty cast", async () => {
    mockFetch(BASE_ANIME, []);
    mount();
    await screen.findByRole("heading", { name: "Test Anime" });
    expect(screen.queryByText("Cast")).not.toBeInTheDocument();
  });

  it("orders Main cast before Supporting cast in the full cast", async () => {
    mockFetch(BASE_ANIME, [
      {
        system_id: "cc2",
        character_id: "char-2",
        character_public_id: 2,
        character_name: "Sidekick",
        voices: [{ person_id: "person-2", person_public_id: 2, person_name: "Seiyuu Two", remark: null }],
        role: "Supporting",
        position: 0,
        photo_file: null,
        remark: null,
      },
      {
        system_id: "cc1",
        character_id: "char-1",
        character_public_id: 1,
        character_name: "Protagonist",
        voices: [{ person_id: "person-1", person_public_id: 1, person_name: "Seiyuu One", remark: null }],
        role: "Main",
        position: 1,
        photo_file: null,
        remark: null,
      },
    ]);
    mount();

    // Collapsed, the slip shows Main only; the full cast lists everyone.
    fireEvent.click(await screen.findByText("Show full cast (2)"));
    const dialog = screen.getByRole("dialog", { name: "Full cast" });
    const characterLinks = within(dialog).getAllByRole("link", {
      name: /Protagonist|Sidekick/,
    });
    expect(characterLinks.map((l) => l.textContent)).toEqual([
      "Protagonist",
      "Sidekick",
    ]);
  });
});

// The season names the JP broadcast, so its year comes from the JP date even
// when the TW one is in a different year.
describe("Anime detail page — release", () => {
  it("builds the release season from the JP date and shows both dates and the runtime", async () => {
    mockFetch(
      {
        ...BASE_ANIME,
        release_season: "SPR",
        release_date_jp: "2024-04",
        release_date_tw: "2025-01-10",
        runtime_min: 23,
      },
      [],
    );
    mount();

    expect((await screen.findAllByText("SPR 2024")).length).toBeGreaterThan(0);
    expect(screen.queryByText("SPR 2025")).toBeNull();
    expect(screen.getByText("2024-04")).toBeInTheDocument();
    expect(screen.getByText("2025-01-10")).toBeInTheDocument();
    expect(screen.getByText("23")).toBeInTheDocument();
  });

  // The airing type sits beside 本傳/外傳, the episode count and runtime
  // beside the airing status, and the season leads the row of dates it is
  // derived from. Original / Remake is shown for a remake alone. The genres
  // are in a Genres card of their own (GenresBlock.test.jsx).
  it("lays the Information card out in these rows", async () => {
    mockFetch({ ...BASE_ANIME, original_or_remake: "Original" }, []);
    mount();

    expect(await infoLabels()).toEqual([
      ["本傳/外傳", "Airing Type", "Season Part"],
      ["Airing Status", "Total Episodes", "Runtime (min)"],
      ["Release Season", "Release Date JP", "Release Date TW"],
    ]);
  });

  it("puts Original / Remake right of the season part for a remake", async () => {
    mockFetch({ ...BASE_ANIME, original_or_remake: "Remake" }, []);
    mount();

    const rows = await infoLabels();
    expect(rows[0]).toEqual([
      "本傳/外傳",
      "Airing Type",
      "Season Part",
      "Original / Remake",
    ]);
    expect(infoValue("Original / Remake")).toBe("Remake");
  });
});

// The season part carries a special's episode after it; there is no row of
// its own for the special.
describe("Anime detail page — season part", () => {
  it("appends the special episode to the season part", async () => {
    mockFetch({ ...BASE_ANIME, season_part: "Season 2", ep_special: "13" }, []);
    mount();
    await infoLabels();
    expect(infoValue("Season Part")).toBe("Season 2 第13集");
    expect(screen.queryByText("Special Episodes")).toBeNull();
  });

  it("shows the season part alone when there is no special episode", async () => {
    mockFetch({ ...BASE_ANIME, season_part: "Season 2", ep_special: null }, []);
    mount();
    await infoLabels();
    expect(infoValue("Season Part")).toBe("Season 2");
  });

  it("shows the special episode alone when there is no season part", async () => {
    mockFetch({ ...BASE_ANIME, season_part: null, ep_special: "0" }, []);
    mount();
    await infoLabels();
    expect(infoValue("Season Part")).toBe("第0集");
  });
});

// The Information card's labels, row by row.
async function infoLabels() {
  const body = (await screen.findByRole("heading", { name: "Information" }))
    .nextElementSibling;
  return [...body.children].map((row) =>
    [...row.querySelectorAll(".font-mono")].map((el) => el.textContent),
  );
}

// The value shown under one Information card label.
function infoValue(label) {
  const body = screen.getByRole("heading", { name: "Information" }).nextElementSibling;
  const labelEl = [...body.querySelectorAll(".font-mono")].find(
    (el) => el.textContent === label,
  );
  return labelEl.nextElementSibling.textContent;
}
