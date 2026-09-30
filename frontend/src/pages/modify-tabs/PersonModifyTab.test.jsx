// Person Modify tab: the picker lists everyone holding the selected sub-tab's
// role up front (like the system options grid), by display name, and the
// search box filters that list across all four name fields.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ToastProvider } from "../../hooks/useToast";
import PersonModifyTab from "./PersonModifyTab";

const DIRECTORS = [
  {
    system_id: "p1",
    name_en: "Hayao Miyazaki",
    name_cn: null,
    name_jp: "宮崎駿",
    name_alt: null,
    display_name_field: null,
    display_name: "Hayao Miyazaki",
    gender: null,
    my_rating: null,
    photo_file: null,
    mal_id: 1870,
    mal_link: "https://myanimelist.net/people/1870",
    credit_count: 3,
    roles: [{ role: "director", scope: "anime" }],
  },
  {
    system_id: "p2",
    name_en: "Mamoru Hosoda",
    name_cn: null,
    name_jp: "細田守",
    name_alt: null,
    display_name_field: null,
    display_name: "Mamoru Hosoda",
    gender: null,
    my_rating: null,
    photo_file: null,
    credit_count: 1,
    roles: [{ role: "director", scope: "anime" }],
  },
  {
    system_id: "p3",
    name_en: "Makoto Shinkai",
    name_cn: null,
    name_jp: "新海誠",
    name_alt: null,
    display_name_field: null,
    display_name: "Makoto Shinkai",
    gender: null,
    my_rating: null,
    photo_file: null,
    credit_count: 2,
    roles: [{ role: "director", scope: "anime-movie" }],
  },
  {
    system_id: "p4",
    name_en: "Christopher Nolan",
    name_cn: null,
    name_jp: null,
    name_alt: null,
    display_name_field: null,
    display_name: "Christopher Nolan",
    gender: null,
    my_rating: null,
    photo_file: null,
    credit_count: 5,
    roles: [{ role: "director", scope: "movie" }],
  },
];

const ROLE_SCOPES = {
  director: ["anime", "anime-movie", "movie"],
  producer: ["anime"],
};

// A person credited twice on one entry (director and writer) is in two
// groups; the fallback picker lists the entry once.
const P1_ENTRIES = {
  groups: [
    {
      media_type: "anime-movie",
      role: "director",
      entries: [
        { system_id: "m1", display_name: "Spirited Away", release_date: "2001-07-20" },
      ],
    },
    {
      media_type: "anime-movie",
      role: "screenplay",
      entries: [
        { system_id: "m1", display_name: "Spirited Away", release_date: "2001-07-20" },
        { system_id: "m2", display_name: "Totoro", release_date: null },
      ],
    },
  ],
};

function respond(url) {
  if (url === "/api/person/p1/entries") return P1_ENTRIES;
  if (url.startsWith("/api/person/p1")) return DIRECTORS[0];
  if (url.startsWith("/api/person/role-scopes")) return ROLE_SCOPES;
  if (url.startsWith("/api/person/?role=director")) return DIRECTORS;
  if (url.startsWith("/api/person/")) return [];
  return [];
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url, options = {}) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(
            options.method === "PUT"
              ? { ...DIRECTORS[0], ...JSON.parse(options.body) }
              : respond(String(url)),
          ),
      }),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

function mount(props = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <PersonModifyTab {...props} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

it("lists everyone in the sub-tab's role by display name before anything is typed", async () => {
  mount();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Hayao Miyazaki" }),
    ).toBeInTheDocument(),
  );
  expect(
    screen.getByRole("button", { name: "Mamoru Hosoda" }),
  ).toBeInTheDocument();
  // Display name only - no credit-count subtitle in the grid.
  expect(screen.queryByText("3 credits")).not.toBeInTheDocument();
});

it("filters the list by a non-displayed name field (e.g. Japanese)", async () => {
  const user = userEvent.setup();
  mount();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Hayao Miyazaki" }),
    ).toBeInTheDocument(),
  );
  await user.type(
    screen.getByPlaceholderText("Search people to modify..."),
    "宮崎",
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Mamoru Hosoda" }),
    ).not.toBeInTheDocument(),
  );
  expect(
    screen.getByRole("button", { name: "Hayao Miyazaki" }),
  ).toBeInTheDocument();
});

it("filters the list to the scopes ticked, matching any one of them", async () => {
  const user = userEvent.setup();
  mount();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Hayao Miyazaki" }),
    ).toBeInTheDocument(),
  );

  // One scope: only the people holding the sub-tab's role in it.
  await user.click(screen.getByRole("button", { name: "anime-movie" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Hayao Miyazaki" }),
    ).not.toBeInTheDocument(),
  );
  expect(
    screen.getByRole("button", { name: "Makoto Shinkai" }),
  ).toBeInTheDocument();

  // A second scope widens the list - in scope for EITHER is enough.
  await user.click(screen.getByRole("button", { name: "anime" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Hayao Miyazaki" }),
    ).toBeInTheDocument(),
  );
  expect(
    screen.getByRole("button", { name: "Makoto Shinkai" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Christopher Nolan" }),
  ).not.toBeInTheDocument();

  // Unticking every scope goes back to showing everyone.
  await user.click(screen.getByRole("button", { name: "anime-movie" }));
  await user.click(screen.getByRole("button", { name: "anime" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Christopher Nolan" }),
    ).toBeInTheDocument(),
  );
});

it("offers no scope filter for a role with a single legal scope", async () => {
  const user = userEvent.setup();
  mount();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "anime-movie" }),
    ).toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: /Producer/ }));
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "anime-movie" }),
    ).not.toBeInTheDocument(),
  );
  expect(screen.queryByRole("button", { name: "anime" })).not.toBeInTheDocument();
});

// Same reason as the Studio tab: the toast sits at the top of a long form.
it("scrolls to the top after a successful save", async () => {
  const user = userEvent.setup();
  const scrollTo = vi.fn();
  vi.stubGlobal("scrollTo", scrollTo);
  mount();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Hayao Miyazaki" }),
    ).toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: "Hayao Miyazaki" }));
  await waitFor(() =>
    expect(screen.getByDisplayValue("Hayao Miyazaki")).toBeInTheDocument(),
  );

  await user.click(screen.getByRole("button", { name: /save changes/i }));

  await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 0));
});

// /modify?id=<system_id>&type=person hands the id in as initialId.
it("opens the editor for initialId without a pick", async () => {
  mount({ initialId: "p1" });
  await waitFor(() =>
    expect(screen.getByDisplayValue("Hayao Miyazaki")).toBeInTheDocument(),
  );
  expect(fetch).toHaveBeenCalledWith("/api/person/p1", expect.anything());
});

it("offers gender and rating as closed selects", async () => {
  mount({ initialId: "p1" });
  const gender = await screen.findByLabelText("Gender");
  expect([...gender.options].map((o) => o.value)).toEqual([
    "", "男", "女", "中性/無性", "雙性混和", "其他",
  ]);
  const rating = screen.getByLabelText("My Rating");
  expect([...rating.options].map((o) => o.textContent)).toEqual([
    "Unrated", "S", "A+", "A", "B", "C", "D", "E", "F",
  ]);
});

it("picks a photo fallback from the person's entries, once each, and saves it", async () => {
  vi.stubGlobal("scrollTo", vi.fn());
  const user = userEvent.setup();
  mount({ initialId: "p1" });
  const picker = await screen.findByLabelText("Photo fallback");
  await waitFor(() => expect(picker.options).toHaveLength(3));
  expect([...picker.options].map((o) => o.textContent)).toEqual([
    "— Auto (latest with cover) —",
    "Spirited Away (2001) [anime-movie]",
    "Totoro [anime-movie]",
  ]);

  await user.selectOptions(picker, "m2");
  await user.click(screen.getByRole("button", { name: /save changes/i }));

  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      "/api/person/p1",
      expect.objectContaining({ method: "PUT" }),
    ),
  );
  const [, init] = fetch.mock.calls.find(([, o]) => o?.method === "PUT");
  expect(JSON.parse(init.body)).toMatchObject({ photo_fallback_entry_id: "m2" });
});

it("loads the MAL link and sends the edited one on save", async () => {
  vi.stubGlobal("scrollTo", vi.fn());
  const user = userEvent.setup();
  mount({ initialId: "p1" });
  const mal = await screen.findByPlaceholderText("https://myanimelist.net/people/...");
  expect(mal).toHaveValue("https://myanimelist.net/people/1870");

  await user.clear(mal);
  await user.type(mal, "https://myanimelist.net/people/1871");
  await user.click(screen.getByRole("button", { name: /save changes/i }));

  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      "/api/person/p1",
      expect.objectContaining({ method: "PUT" }),
    ),
  );
  const [, init] = fetch.mock.calls.find(([, o]) => o?.method === "PUT");
  expect(JSON.parse(init.body)).toMatchObject({
    mal_link: "https://myanimelist.net/people/1871",
  });
});
