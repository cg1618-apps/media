// Frontend: the viewer's own rating on the entity Modify forms.
//
// A person's, studio's, publisher's or character's rating is the viewer's
// own (user_rating), so the catalogue PUT never carries it: the form loads it
// from the record, and once the record has saved, PUTs only a change to
// /api/me/ratings. Drawn only for a viewer who keeps a list (self.list) - the
// mirror case is the same viewer without it, and nothing else differs.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "../../hooks/useToast";
import PersonModifyTab from "./PersonModifyTab";
import StudioModifyTab from "./StudioModifyTab";

const viewer = { keepsList: true };
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    has: (permission) => permission !== "self.list" || viewer.keepsList,
    visibleGatedTypes: [],
    user: { username: "cg1618" },
    modes: [],
  }),
}));

const PERSON = {
  system_id: "p1",
  public_id: 1,
  name_en: "Kana Hanazawa",
  name_cn: null,
  name_jp: null,
  name_alt: null,
  display_name_field: null,
  display_name: "Kana Hanazawa",
  gender: null,
  photo_file: null,
  roles: [{ role: "seiyuu", scope: "anime" }],
  my_rating: "A",
};

const STUDIO = {
  system_id: "s1",
  public_id: 1,
  name_en: "Sunrise",
  name_cn: null,
  name_jp: null,
  name_alt: null,
  display_name_field: null,
  display_name: "Sunrise",
  my_rating: null,
};

function respond(url) {
  if (url === "/api/person/p1") return PERSON;
  if (url === "/api/studio/s1") return STUDIO;
  if (url.startsWith("/api/person/role-scopes")) return {};
  if (url.startsWith("/api/studio/")) return [STUDIO];
  return [];
}

const calls = (method, prefix) =>
  fetch.mock.calls
    .filter(([url, o]) => (o?.method || "GET") === method && String(url).startsWith(prefix))
    .map(([url, o]) => ({ url: String(url), body: o?.body ? JSON.parse(o.body) : null }));

beforeEach(() => {
  viewer.keepsList = true;
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal(
    "fetch",
    vi.fn((url, options = {}) => {
      const u = String(url);
      let body;
      if (options.method === "PUT" && u.startsWith("/api/me/ratings/")) {
        const [, , , ownerType, ownerId] = u.split("/");
        body = {
          owner_type: ownerType,
          owner_id: ownerId,
          my_rating: JSON.parse(options.body).my_rating ?? null,
          expectation: null,
        };
      } else if (options.method === "PUT") {
        // The catalogue write answers the row with the STORED rating.
        body = { ...(u.includes("/person/") ? PERSON : STUDIO), ...JSON.parse(options.body) };
      } else {
        body = respond(u);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function mount(ui) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
}

describe("entity Modify - the viewer's own rating", () => {
  it("loads a person's rating and PUTs only the change, never in the catalogue write", async () => {
    const user = userEvent.setup();
    mount(<PersonModifyTab initialId="p1" />);
    const rating = await screen.findByLabelText("My Rating");
    await waitFor(() => expect(rating).toHaveValue("A"));

    await user.selectOptions(rating, "S");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(calls("PUT", "/api/me/ratings/")).toHaveLength(1));
    expect(calls("PUT", "/api/me/ratings/")[0]).toEqual({
      url: "/api/me/ratings/person/p1",
      body: { my_rating: "S" },
    });
    expect(calls("PUT", "/api/person/")[0].body).not.toHaveProperty("my_rating");
    // The form now holds the saved value.
    await waitFor(() => expect(screen.getByLabelText("My Rating")).toHaveValue("S"));
  });

  it("sends no rating PUT when the rating did not change", async () => {
    const user = userEvent.setup();
    mount(<PersonModifyTab initialId="p1" />);
    await waitFor(() => expect(screen.getByLabelText("My Rating")).toHaveValue("A"));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(calls("PUT", "/api/person/")).toHaveLength(1));
    expect(calls("PUT", "/api/me/ratings/")).toHaveLength(0);
  });

  it("rates a studio with no rating yet", async () => {
    const user = userEvent.setup();
    mount(<StudioModifyTab initialId="s1" />);
    const rating = await screen.findByLabelText("My Rating");
    await user.selectOptions(rating, "B");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(calls("PUT", "/api/me/ratings/")).toHaveLength(1));
    expect(calls("PUT", "/api/me/ratings/")[0]).toEqual({
      url: "/api/me/ratings/studio/s1",
      body: { my_rating: "B" },
    });
  });

  it("is not offered to a viewer who keeps no list", async () => {
    viewer.keepsList = false;
    mount(<PersonModifyTab initialId="p1" />);
    expect(await screen.findByDisplayValue("Kana Hanazawa")).toBeInTheDocument();
    expect(screen.queryByLabelText("My Rating")).toBeNull();
  });
});
