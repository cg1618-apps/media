// Frontend: an Add tab has no row id until its entry is saved, so
// ImagePicker cannot attach the picked image at pick time - it hands the
// image id up as `pending_image_id` instead (see ImagePicker.jsx's module
// comment and config/formFactories.js). This test guards the Person tab's
// post-save attach: once the person is created, submitPerson() must attach
// the pending image itself, using the new person's id, and must surface a
// failure to attach rather than dropping it silently - a dropped attach
// would leave the upload orphaned and show as Unused on /images, where the
// unused-only Delete would remove a file the saved person still points at.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Add from "./Add";

const showToast = vi.fn();
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast }),
}));

const attachUploadedImage = vi.fn();
// Mocking the module ImagePicker.jsx resolves to (shared by every Add tab) -
// a stub button stands in for the real upload widget so the test exercises
// Add.jsx's save flow, not file inputs and FormData.
vi.mock("../../components/forms/ImagePicker", () => ({
  default: ({ onChange }) => (
    <button
      type="button"
      onClick={() => onChange("library/new.jpg", "img-1")}
    >
      Simulate image pick
    </button>
  ),
  attachUploadedImage: (...args) => attachUploadedImage(...args),
}));

function mockFetch(personResponse) {
  return vi.fn((url, options = {}) => {
    const u = String(url);
    const method = options.method || "GET";
    if (u === "/api/person/" && method === "POST") {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(personResponse),
      });
    }
    // Every other GET the initial page load fires (anime/franchise/series/
    // sources/form-defaults/role-scopes/etc.) is irrelevant to this flow.
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    });
  });
}

beforeEach(() => {
  showToast.mockReset();
  attachUploadedImage.mockReset();
});

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Add />
    </QueryClientProvider>,
  );
}

// The first name input. The tab's MAL and IMDb search boxes are textboxes
// too, and sit above the form.
function firstNameInput() {
  return screen
    .getAllByRole("textbox")
    .find((el) => !/^Search /.test(el.getAttribute("aria-label") || ""));
}

async function goToPersonTab(user) {
  await waitFor(() =>
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: "Entity" }));
  await user.click(screen.getByRole("button", { name: "Person" }));
}

describe("Add page — Person tab image attach", () => {
  it("attaches the pending image once the person is saved", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ system_id: "person-1", display_name: "New Person" }),
    );
    attachUploadedImage.mockResolvedValue({});
    const user = userEvent.setup();

    mount();
    await goToPersonTab(user);

    const nameInput = firstNameInput();
    await user.type(nameInput, "Ada Lovelace");
    await user.click(
      screen.getByRole("button", { name: /simulate image pick/i }),
    );
    await user.click(screen.getByRole("button", { name: /append entry/i }));

    await waitFor(() =>
      expect(attachUploadedImage).toHaveBeenCalledWith(
        "img-1",
        "staff",
        "person-1",
        "cover",
      ),
    );
    expect(showToast).not.toHaveBeenCalledWith("error", expect.anything());

    vi.unstubAllGlobals();
  });

  it("surfaces a failed post-save attach instead of dropping it", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ system_id: "person-2", display_name: "Grace Hopper" }),
    );
    attachUploadedImage.mockRejectedValue(new Error("Unknown owner type"));
    const user = userEvent.setup();

    mount();
    await goToPersonTab(user);

    const nameInput = firstNameInput();
    await user.type(nameInput, "Grace Hopper");
    await user.click(
      screen.getByRole("button", { name: /simulate image pick/i }),
    );
    await user.click(screen.getByRole("button", { name: /append entry/i }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith("error", "Unknown owner type"),
    );
    // The person itself still saved - a failed attach must not be reported
    // as a failed save.
    expect(showToast).toHaveBeenCalledWith(
      "success",
      "Person appended successfully.",
    );

    vi.unstubAllGlobals();
  });

  it("carries the MAL link in the create payload", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ system_id: "person-3", display_name: "Kana Hanazawa" }),
    );
    const user = userEvent.setup();

    mount();
    await goToPersonTab(user);

    const nameInput = firstNameInput();
    await user.type(nameInput, "Kana Hanazawa");
    await user.type(
      screen.getByPlaceholderText("https://myanimelist.net/people/..."),
      "https://myanimelist.net/people/185",
    );
    await user.click(screen.getByRole("button", { name: /append entry/i }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/person/",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const [, init] = fetch.mock.calls.find(
      ([u, o]) => u === "/api/person/" && o?.method === "POST",
    );
    expect(JSON.parse(init.body)).toMatchObject({
      mal_link: "https://myanimelist.net/people/185",
    });

    vi.unstubAllGlobals();
  });

  it("carries the IMDb link in the create payload", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ system_id: "person-4", display_name: "Kana Hanazawa" }),
    );
    const user = userEvent.setup();

    mount();
    await goToPersonTab(user);

    await user.type(firstNameInput(), "Kana Hanazawa");
    await user.type(
      screen.getByPlaceholderText("https://www.imdb.com/name/..."),
      "https://www.imdb.com/name/nm2017929/",
    );
    await user.click(screen.getByRole("button", { name: /append entry/i }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/person/",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const [, init] = fetch.mock.calls.find(
      ([u, o]) => u === "/api/person/" && o?.method === "POST",
    );
    expect(JSON.parse(init.body)).toMatchObject({
      imdb_link: "https://www.imdb.com/name/nm2017929/",
    });

    vi.unstubAllGlobals();
  });

  it("links the IMDb page picked in the IMDb search, through TMDB", async () => {
    const base = mockFetch({ system_id: "person-6", display_name: "Keanu Reeves" });
    vi.stubGlobal(
      "fetch",
      vi.fn((url, options) => {
        const u = String(url);
        const json = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
        if (u.startsWith("/api/person/search-imdb")) {
          return json([
            {
              external_id: "person/6384",
              link: "https://www.themoviedb.org/person/6384",
              title: "Keanu Reeves",
              detail: "Acting",
            },
          ]);
        }
        if (u.startsWith("/api/person/tmdb-imdb-id")) {
          return json({ imdb_id: "nm0000206", imdb_link: "https://www.imdb.com/name/nm0000206/" });
        }
        return base(url, options);
      }),
    );
    const user = userEvent.setup();

    mount();
    await goToPersonTab(user);
    await user.type(screen.getByRole("textbox", { name: "Search IMDb" }), "keanu");
    await user.click(await screen.findByRole("option", { name: /Keanu Reeves/ }));

    await waitFor(() =>
      expect(screen.getByPlaceholderText("https://www.imdb.com/name/...")).toHaveValue(
        "https://www.imdb.com/name/nm0000206/",
      ),
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/person/tmdb-imdb-id?ref=person%2F6384",
      expect.anything(),
    );
    // A blank English name takes the picked name.
    expect(screen.getByRole("textbox", { name: "Name (English)" })).toHaveValue("Keanu Reeves");

    vi.unstubAllGlobals();
  });

  it("carries the AniList link, trimmed, in the create payload", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ system_id: "person-5", display_name: "Kana Hanazawa" }),
    );
    const user = userEvent.setup();

    mount();
    await goToPersonTab(user);

    await user.type(firstNameInput(), "Kana Hanazawa");
    await user.type(
      screen.getByPlaceholderText("https://anilist.co/staff/..."),
      " https://anilist.co/staff/95185 ",
    );
    await user.click(screen.getByRole("button", { name: /append entry/i }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/person/",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const [, init] = fetch.mock.calls.find(
      ([u, o]) => u === "/api/person/" && o?.method === "POST",
    );
    expect(JSON.parse(init.body)).toMatchObject({
      anilist_link: "https://anilist.co/staff/95185",
    });

    vi.unstubAllGlobals();
  });

  it("puts the ticked content labels on the person once it is created", async () => {
    const labels = [
      { system_id: "l1", key: "nsfw", label: "NSFW", description: "" },
      { system_id: "l3", key: "erotica", label: "擦邊肉番", description: "" },
    ];
    const base = mockFetch({ system_id: "person-1", display_name: "New Person" });
    vi.stubGlobal(
      "fetch",
      vi.fn((url, options = {}) =>
        String(url) === "/api/content-labels/"
          ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(labels) })
          : base(url, options),
      ),
    );
    const user = userEvent.setup();

    mount();
    await goToPersonTab(user);
    await user.type(firstNameInput(), "Ada Lovelace");
    // In the Profile section, beside the content rating.
    const erotica = await screen.findByRole("checkbox", { name: "擦邊肉番" });
    expect(screen.getByLabelText("Content rating").closest(".grid")).toContainElement(erotica);
    await user.click(erotica);
    await user.click(screen.getByRole("button", { name: /append entry/i }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/content-labels/person/person-1",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    const [, init] = fetch.mock.calls.find(
      ([u]) => u === "/api/content-labels/person/person-1",
    );
    expect(JSON.parse(init.body).label_keys.sort()).toEqual(["erotica", "nsfw"]);
    expect(showToast).not.toHaveBeenCalledWith("error", expect.anything());

    vi.unstubAllGlobals();
  });
});
