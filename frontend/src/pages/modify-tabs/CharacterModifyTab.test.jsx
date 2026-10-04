// Character Modify tab: a type tab and scope chips narrow a grid listing
// every character up front; picking one loads its form, and a successful save scrolls the page back to the toast at the top.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ToastProvider } from "../../hooks/useToast";
import CharacterModifyTab from "./CharacterModifyTab";

const CHARACTERS = [
  {
    system_id: "c1",
    name_en: "Spike Spiegel",
    name_cn: null,
    name_jp: "スパイク・スピーゲル",
    name_alt: null,
    display_name_field: null,
    display_name: "Spike Spiegel",
    gender: null,
    my_rating: null,
    photo_file: null,
    remark: null,
    media_types: ["anime"],
    casting_count: 1,
  },
  {
    system_id: "c2",
    name_en: "Faye Valentine",
    name_cn: null,
    name_jp: null,
    name_alt: null,
    display_name_field: null,
    display_name: "Faye Valentine",
    gender: null,
    my_rating: null,
    photo_file: null,
    remark: null,
    role: "Core",
    media_types: ["anime", "manga"],
    casting_count: 2,
  },
  {
    // Nothing requires a character to have a type; only All lists this one.
    system_id: "c3",
    name_en: "Ein",
    name_cn: null,
    name_jp: null,
    name_alt: null,
    display_name_field: null,
    display_name: "Ein",
    gender: null,
    my_rating: null,
    photo_file: null,
    remark: null,
    role: null,
    media_types: [],
    casting_count: 0,
  },
];

const C1_ENTRIES = {
  groups: [
    {
      media_type: "anime",
      entries: [
        { system_id: "a1", display_name: "Cowboy Bebop", release_date: "1998-04-03" },
      ],
    },
  ],
};

function respond(url) {
  if (url === "/api/character/c1/entries") return C1_ENTRIES;
  if (url.startsWith("/api/character/c1")) return CHARACTERS[0];
  if (url.startsWith("/api/character/")) return CHARACTERS;
  return [];
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url, options = {}) => {
      const u = String(url);
      if (u === "/api/images" && options.method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              system_id: "img1",
              storage_key: "library/uploaded.jpg",
            }),
        });
      }
      if (u.includes("/attach") && options.method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ system_id: "att1" }),
        });
      }
      if (options.method === "PUT") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({ ...CHARACTERS[0], ...JSON.parse(options.body) }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(respond(u)),
      });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function mount(props = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <CharacterModifyTab {...props} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

async function openSpike(user) {
  mount();
  await user.type(
    screen.getByPlaceholderText("Search characters to modify..."),
    "spike",
  );
  await waitFor(() =>
    expect(screen.getByText("Spike Spiegel")).toBeInTheDocument(),
  );
  await user.click(screen.getByText("Spike Spiegel"));
  await waitFor(() =>
    expect(screen.getByDisplayValue("Spike Spiegel")).toBeInTheDocument(),
  );
}

it("opens on All, listing a character with no type, and narrows by type", async () => {
  const user = userEvent.setup();
  mount();
  expect(await screen.findByRole("button", { name: "Ein" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Spike Spiegel" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Core" }));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Ein" })).not.toBeInTheDocument(),
  );
  expect(screen.queryByRole("button", { name: "Spike Spiegel" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Faye Valentine" })).toBeInTheDocument();
});

it("narrows the list to the media types a character is cast in", async () => {
  const user = userEvent.setup();
  mount();
  await user.click(await screen.findByRole("button", { name: "manga" }));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Spike Spiegel" })).not.toBeInTheDocument(),
  );
  expect(screen.getByRole("button", { name: "Faye Valentine" })).toBeInTheDocument();
});

it("loads the picked character into the form", async () => {
  const user = userEvent.setup();
  await openSpike(user);
  expect(
    screen.getByDisplayValue("スパイク・スピーゲル"),
  ).toBeInTheDocument();
});

// The Photo field renders ImagePicker rather than a bare text input once a
// character is selected (selectedId is the ownerId ImagePicker attaches to),
// and picking a file uploads it, attaches it to this character, and writes
// the returned storage key back into the form.
it("renders the image picker for Photo and writes the picked key through", async () => {
  const user = userEvent.setup();
  await openSpike(user);

  const fileInput = screen.getByLabelText(/upload/i);
  const file = new File(["x"], "spike.jpg", { type: "image/jpeg" });
  await user.upload(fileInput, file);

  await waitFor(() =>
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "/static/library/uploaded.jpg",
    ),
  );
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/attach"),
    expect.objectContaining({ method: "POST" }),
  );
});

// Same reason as the Studio and Person tabs: the toast sits at the top of a
// long form, so a successful save scrolls back up.
it("scrolls to the top after a successful save", async () => {
  const user = userEvent.setup();
  const scrollTo = vi.fn();
  vi.stubGlobal("scrollTo", scrollTo);
  await openSpike(user);

  await user.click(screen.getByRole("button", { name: /save changes/i }));

  await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 0));
});

// /modify?id=<system_id>&type=character hands the id in as initialId.
it("opens the editor for initialId without a search", async () => {
  mount({ initialId: "c1" });
  await waitFor(() =>
    expect(screen.getByDisplayValue("Spike Spiegel")).toBeInTheDocument(),
  );
  expect(
    screen.queryByPlaceholderText("Search characters to modify..."),
  ).not.toBeInTheDocument();
});

it("saves gender, rating and the photo fallback from their selects", async () => {
  vi.stubGlobal("scrollTo", vi.fn());
  const user = userEvent.setup();
  mount({ initialId: "c1" });
  await user.selectOptions(await screen.findByLabelText("Gender"), "男");
  await user.selectOptions(screen.getByLabelText("My Rating"), "A+");
  const picker = screen.getByLabelText("Photo fallback");
  await waitFor(() => expect(picker.options).toHaveLength(2));
  expect(picker.options[1].textContent).toBe("Cowboy Bebop (1998) [anime]");
  await user.selectOptions(picker, "a1");

  await user.click(screen.getByRole("button", { name: /save changes/i }));

  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      "/api/character/c1",
      expect.objectContaining({ method: "PUT" }),
    ),
  );
  const [, init] = fetch.mock.calls.find(([, o]) => o?.method === "PUT");
  expect(JSON.parse(init.body)).toMatchObject({
    gender: "男",
    my_rating: "A+",
    photo_fallback_entry_id: "a1",
  });
});

// An unsaved character has no entries, so the Add form has no fallback picker.
it("has no photo fallback picker without an ownerId", async () => {
  const { CharacterFields } = await import("../add-tabs/CharacterAddTab");
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <CharacterFields characterForm={{}} ucf={() => {}} />
    </QueryClientProvider>,
  );
  expect(screen.queryByLabelText("Photo fallback")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Gender")).toBeInTheDocument();
});

// A character's own role: one chip per CHARACTER_ROLES value, unset (null)
// when none is pressed. It is never read from or written to a casting's role.
it("edits the character's own role through its chips", async () => {
  vi.stubGlobal("scrollTo", vi.fn());
  const user = userEvent.setup();
  mount({ initialId: "c1" });
  const role = await screen.findByRole("group", { name: "Role" });
  const chips = [...role.querySelectorAll("button")];
  expect(chips.map((b) => b.textContent)).toEqual([
    "Main", "Core", "Supporting", "Other",
  ]);
  expect(chips.every((b) => b.getAttribute("aria-pressed") === "false")).toBe(true);

  await user.click(within(role).getByRole("button", { name: "Core" }));
  expect(within(role).getByRole("button", { name: "Core" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await user.click(screen.getByRole("button", { name: /save changes/i }));
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      "/api/character/c1",
      expect.objectContaining({ method: "PUT" }),
    ),
  );
  const [, init] = fetch.mock.calls.find(([, o]) => o?.method === "PUT");
  expect(JSON.parse(init.body)).toMatchObject({ role: "Core" });
});

it("clears the role when its pressed chip is clicked again", async () => {
  vi.stubGlobal("scrollTo", vi.fn());
  const user = userEvent.setup();
  mount({ initialId: "c1" });
  const role = await screen.findByRole("group", { name: "Role" });
  await user.click(within(role).getByRole("button", { name: "Main" }));
  await user.click(within(role).getByRole("button", { name: "Main" }));
  await user.click(screen.getByRole("button", { name: /save changes/i }));
  await waitFor(() =>
    expect(fetch.mock.calls.some(([, o]) => o?.method === "PUT")).toBe(true),
  );
  const [, init] = fetch.mock.calls.find(([, o]) => o?.method === "PUT");
  expect(JSON.parse(init.body).role).toBeNull();
});

// 男 and 女 are one click; the select beside them still offers every gender
// and follows whatever is picked.
it("sets gender from its quick picks and keeps the select in step", async () => {
  vi.stubGlobal("scrollTo", vi.fn());
  const user = userEvent.setup();
  mount({ initialId: "c1" });
  const picks = await screen.findByRole("group", { name: "Gender quick picks" });
  await user.click(within(picks).getByRole("button", { name: "女" }));
  expect(screen.getByLabelText("Gender")).toHaveValue("女");
  expect(within(picks).getByRole("button", { name: "女" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await user.click(screen.getByRole("button", { name: /save changes/i }));
  await waitFor(() =>
    expect(fetch.mock.calls.some(([, o]) => o?.method === "PUT")).toBe(true),
  );
  const [, init] = fetch.mock.calls.find(([, o]) => o?.method === "PUT");
  expect(JSON.parse(init.body).gender).toBe("女");
});

// Appearance and trait load from the response's arrays and go back as
// arrays - [] for an empty list, since the server replaces each wholesale.
it("loads and saves appearance and trait as arrays", async () => {
  vi.stubGlobal("scrollTo", vi.fn());
  const user = userEvent.setup();
  const original = CHARACTERS[0];
  CHARACTERS[0] = { ...original, appearance: ["Green Hair"], trait: [] };
  try {
    mount({ initialId: "c1" });
    expect(await screen.findByText("Green Hair")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() =>
      expect(fetch.mock.calls.some(([, o]) => o?.method === "PUT")).toBe(true),
    );
    const [, init] = fetch.mock.calls.find(([, o]) => o?.method === "PUT");
    expect(JSON.parse(init.body)).toMatchObject({
      appearance: ["Green Hair"],
      trait: [],
    });
  } finally {
    CHARACTERS[0] = original;
  }
});

it("sends an unset role as null", async () => {
  vi.stubGlobal("scrollTo", vi.fn());
  const user = userEvent.setup();
  mount({ initialId: "c1" });
  await screen.findByRole("group", { name: "Role" });
  await user.click(screen.getByRole("button", { name: /save changes/i }));
  await waitFor(() =>
    expect(fetch.mock.calls.some(([, o]) => o?.method === "PUT")).toBe(true),
  );
  const [, init] = fetch.mock.calls.find(([, o]) => o?.method === "PUT");
  expect(JSON.parse(init.body).role).toBeNull();
});

