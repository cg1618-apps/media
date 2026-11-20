// Studio Modify tab: the picker lists every studio up front (like the system
// options grid), the search box filters that list across all four name fields
// (not just the displayed one), and the save button enforces the
// at-least-one-name rule.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ToastProvider } from "../../hooks/useToast";
import StudioModifyTab from "./StudioModifyTab";

const STUDIOS = [
  {
    system_id: "s1",
    name_en: "Sunrise",
    name_cn: null,
    name_jp: "サンライズ",
    name_alt: null,
    display_name_field: null,
    display_name: "Sunrise",
    credit_count: 5,
    media_types: ["anime", "game"],
    logo_file: null,
    my_rating: null,
    founded_date: null,
    defunct_date: null,
    countries: null,
    website_url: null,
    mal_id: null,
    mal_link: null,
  },
  {
    system_id: "s2",
    name_en: "Kyoto Animation",
    name_cn: null,
    name_jp: "京都アニメーション",
    name_alt: null,
    display_name_field: null,
    display_name: "Kyoto Animation",
    credit_count: 2,
    media_types: ["anime"],
    logo_file: null,
    my_rating: null,
    founded_date: null,
    defunct_date: null,
    countries: ["Japan", "China"],
    website_url: null,
    mal_id: null,
    mal_link: null,
  },
];

function respond(url) {
  if (url.startsWith("/api/studio/s1")) return STUDIOS[0];
  if (url.startsWith("/api/studio/s2")) return STUDIOS[1];
  if (url.startsWith("/api/studio/")) return STUDIOS;
  return [];
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url, options = {}) => {
      if (options.method === "PUT") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ ...STUDIOS[0], ...JSON.parse(options.body) }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(respond(String(url))),
      });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function mount(props = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <StudioModifyTab {...props} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

it("lists every studio by display name before anything is typed", async () => {
  mount();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Sunrise" })).toBeInTheDocument(),
  );
  expect(
    screen.getByRole("button", { name: "Kyoto Animation" }),
  ).toBeInTheDocument();
  // Display name only - no credit-count subtitle in the grid.
  expect(screen.queryByText("5 credits")).not.toBeInTheDocument();
});

it("filters the list by a non-displayed name field (e.g. Japanese)", async () => {
  const user = userEvent.setup();
  mount();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Sunrise" })).toBeInTheDocument(),
  );
  await user.type(
    screen.getByPlaceholderText("Search studios to modify..."),
    "サンライズ",
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Kyoto Animation" }),
    ).not.toBeInTheDocument(),
  );
  expect(screen.getByRole("button", { name: "Sunrise" })).toBeInTheDocument();
});

it("narrows the list to the media types a studio is credited on", async () => {
  const user = userEvent.setup();
  mount();
  // Offered only the scopes some studio holds, in MEDIA_TYPES order.
  await user.click(await screen.findByRole("button", { name: "game" }));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Kyoto Animation" })).not.toBeInTheDocument(),
  );
  expect(screen.getByRole("button", { name: "Sunrise" })).toBeInTheDocument();
  // Matching is OR: adding anime brings Kyoto Animation back.
  await user.click(screen.getByRole("button", { name: "anime" }));
  expect(await screen.findByRole("button", { name: "Kyoto Animation" })).toBeInTheDocument();
});

it("loads the selected studio and disables save with hint when every name is cleared", async () => {
  const user = userEvent.setup();
  mount();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Sunrise" })).toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: "Sunrise" }));

  await waitFor(() =>
    expect(screen.getByDisplayValue("Sunrise")).toBeInTheDocument(),
  );
  const saveButton = screen.getByRole("button", { name: /save changes/i });
  expect(saveButton).not.toBeDisabled();

  await user.clear(screen.getByDisplayValue("Sunrise"));
  await user.clear(screen.getByDisplayValue("サンライズ"));

  expect(
    screen.getByText("A studio needs at least one name."),
  ).toBeInTheDocument();
  expect(saveButton).toBeDisabled();
});

// My rating is the viewer's own, written through /api/me/ratings: the
// catalogue PUT never carries it, and a viewer who keeps no list - this
// file's, with no AuthContext - is not offered it. A list keeper's field is
// EntityRating.test.jsx.
it("offers no rating without a list, and the catalogue PUT carries none", async () => {
  const user = userEvent.setup();
  mount();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Sunrise" })).toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: "Sunrise" }));

  await waitFor(() =>
    expect(screen.getByDisplayValue("Sunrise")).toBeInTheDocument(),
  );
  expect(screen.queryByRole("option", { name: "A+" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /save changes/i }));
  const put = () => fetch.mock.calls.find(([, o]) => o?.method === "PUT");
  await waitFor(() => expect(put()).toBeDefined());
  expect(JSON.parse(put()[1].body)).not.toHaveProperty("my_rating");
});

// No country is a value the admin can choose, so the editor shows it as
// empty rather than seeding one: a seed on load cannot be told apart from a
// stored value, and would write itself back on the next save of any field.
it("leaves unset countries empty and saves them as null", async () => {
  const user = userEvent.setup();
  mount();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Sunrise" })).toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: "Sunrise" }));
  await waitFor(() =>
    expect(screen.getByDisplayValue("Sunrise")).toBeInTheDocument(),
  );
  expect(screen.queryByDisplayValue("Japan")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /save changes/i }));
  const put = () => fetch.mock.calls.find(([, o]) => o?.method === "PUT");
  await waitFor(() => expect(put()).toBeDefined());
  expect(JSON.parse(put()[1].body).countries).toBeNull();
  // The form is rebuilt from the saved record, which must not re-seed either.
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /save changes/i })).toBeEnabled(),
  );
  expect(screen.queryByDisplayValue("Japan")).not.toBeInTheDocument();
});

// A saved studio's toast lands at the top of the page, and the form is long
// enough that the admin is usually scrolled past it - so a successful save
// scrolls back up, the way every media tab already does.
it("scrolls to the top after a successful save", async () => {
  const user = userEvent.setup();
  const scrollTo = vi.fn();
  vi.stubGlobal("scrollTo", scrollTo);
  mount();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Sunrise" })).toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: "Sunrise" }));
  await waitFor(() =>
    expect(screen.getByDisplayValue("Sunrise")).toBeInTheDocument(),
  );

  await user.click(screen.getByRole("button", { name: /save changes/i }));

  await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 0));
});

// /modify?id=<system_id>&type=studio (the detail page's Quick edit) hands the
// id in as initialId.
it("opens the editor for initialId without a pick", async () => {
  mount({ initialId: "s1" });
  await waitFor(() =>
    expect(screen.getByDisplayValue("Sunrise")).toBeInTheDocument(),
  );
  expect(
    screen.queryByPlaceholderText("Search studios to modify..."),
  ).not.toBeInTheDocument();
});

// Several countries load as pills and save back as the same list, in order.
it("keeps a studio's several countries through a save", async () => {
  const user = userEvent.setup();
  mount();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Kyoto Animation" })).toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: "Kyoto Animation" }));
  await waitFor(() =>
    expect(screen.getByDisplayValue("Kyoto Animation")).toBeInTheDocument(),
  );
  expect(screen.getByText("China")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /save changes/i }));
  const put = () => fetch.mock.calls.find(([, o]) => o?.method === "PUT");
  await waitFor(() => expect(put()).toBeDefined());
  expect(JSON.parse(put()[1].body).countries).toEqual(["Japan", "China"]);
});
