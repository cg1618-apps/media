// CastEditor's contracts that matter for a casting row: the seiyuu column
// only exists where ck_casting_voice_scope allows a person_id (anime,
// anime-movie), position stays contiguous after a removal, the character
// combobox never fetches anything until it is actually used (Fix round 1,
// finding 1), the selected pill shows a plain name rather than the search
// annotation (Fix round 1, finding 2), and — the heart of Decision G — the
// character combobox never silently reuses or silently mints a name match;
// it always offers both as separate, explicit choices.
import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import CastEditor, { importedRow } from "./CastEditor";

// The photo cell is ImagePicker, whose upload and library calls are its own
// tests' business. A stub stands in for it and records the props it was
// given, so these tests can see how CastEditor wires it.
const pickerProps = [];
vi.mock("./ImagePicker", () => ({
  default: (props) => {
    pickerProps.push(props);
    return (
      <div>
        <button type="button" onClick={() => props.onChange("library/pick.jpg", "img-1")}>
          Simulate photo pick
        </button>
        <button type="button" onClick={() => props.onChange("", null)}>
          Simulate photo remove
        </button>
        {/* What the real picker does on a pick: the key, then the cleared
            focus, in one handler and before any re-render. */}
        <button
          type="button"
          onClick={() => {
            props.onChange("library/next.jpg", "img-2");
            props.onFocusChange?.(null);
          }}
        >
          Simulate photo pick with focus reset
        </button>
        <button type="button" onClick={() => props.onFocusChange?.("30% 15%")}>
          Simulate focus adjust
        </button>
      </div>
    );
  },
}));

// CastEditor is fully controlled: typing a character re-renders it only if
// the parent feeds the updated row back in as `value`. Tests that exercise
// typing need a real (if minimal) parent, not a `vi.fn()` no-op onChange.
function Controlled({ initialRows, mediaType, onChangeSpy, franchiseId, entryId }) {
  const [rows, setRows] = useState(initialRows);
  return (
    <CastEditor
      mediaType={mediaType}
      franchiseId={franchiseId}
      entryId={entryId}
      value={rows}
      onChange={(next) => {
        onChangeSpy(next);
        setRows(next);
      }}
    />
  );
}

const YUKI = {
  system_id: "c1",
  name_en: "Yuki",
  display_name: "Yuki",
  casting_count: 1,
};
const YUKI_ENTRIES = [
  {
    media_type: "anime",
    nav_path: "/anime",
    entries: [{ system_id: "e1", display_name: "Show A" }],
  },
];

function row(overrides = {}) {
  return {
    system_id: undefined,
    character_id: null,
    character_name: "",
    voices: [],
    role: "",
    position: 0,
    photo_file: null,
    remark: "",
    ...overrides,
  };
}

function mockFetch({ characters = [], entriesByCharacter = {}, createdCharacter } = {}) {
  return vi.fn((url, init) => {
    const method = init?.method || "GET";
    // The name-searched endpoint the character combobox actually uses.
    if (url.startsWith("/api/character/?name=") && method === "GET") {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(characters) });
    }
    // The bare, unfiltered endpoint. Fix round 1 exists so the character
    // combobox never hits this on mount — kept here only so a regression
    // would show up as unexpected data, not a network error.
    if (url === "/api/character/" && method === "GET") {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(characters) });
    }
    if (url === "/api/character/" && method === "POST") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(createdCharacter),
      });
    }
    const entriesMatch = /^\/api\/character\/([^/]+)\/entries$/.exec(url);
    if (entriesMatch) {
      // The real endpoint returns an OBJECT ({"groups": [...]}), never a
      // bare array - Fix round: the CastEditor test used to mock a bare
      // array here, which encoded the wrong contract and let CastEditor.jsx
      // ship with `(Array.isArray(groups) ? groups : []).flatMap(...)`
      // silently always-empty against the server's real shape.
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ groups: entriesByCharacter[entriesMatch[1]] || [] }),
      });
    }
    if (url.startsWith("/api/person/")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }
    if (url === "/api/constants") {
      return Promise.resolve({ ok: false });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch());
  pickerProps.length = 0;
});

it("renders one row per cast member", async () => {
  const rows = [row({ character_name: "A" }), row({ character_name: "B", position: 1 })];
  render(<CastEditor mediaType="anime" value={rows} onChange={vi.fn()} />);

  expect(screen.getAllByLabelText("Remove")).toHaveLength(2);
  expect(screen.getAllByLabelText("Role")).toHaveLength(2);
  await waitFor(() => expect(fetch).toHaveBeenCalled());
});

it("gives every cell at most one width utility", async () => {
  // jsdom lays nothing out, so this pins the mechanism of the defect rather
  // than the picture: a shared `w-full` beside the Role select's own `w-28`
  // let `w-full` win on stylesheet order, and the non-shrinking select took
  // the whole row. Checked on h-comic, where it was seen, and on anime, whose
  // seiyuu column adds a cell.
  for (const mediaType of ["h-comic", "anime"]) {
    const { unmount } = render(
      <CastEditor mediaType={mediaType} value={[row()]} onChange={vi.fn()} />,
    );
    const cells = [
      screen.getByLabelText("Role"),
      screen.getByRole("group", { name: "Photo" }),
      screen.getByLabelText("Remark"),
    ];
    for (const cell of cells) {
      const widths = [...cell.classList].filter((c) => /^w-/.test(c));
      expect(widths.length, `${mediaType} ${cell.getAttribute("aria-label")}`).toBeLessThanOrEqual(1);
    }
    expect(screen.getByLabelText("Role")).toHaveClass("w-28", "shrink-0");
    unmount();
  }
  await waitFor(() => expect(fetch).toHaveBeenCalled());
});

it("sets a cast photo through ImagePicker, never a typed key", async () => {
  const onChangeSpy = vi.fn();
  render(
    <Controlled
      mediaType="h-comic"
      initialRows={[row({ photo_file: "library/old.jpg" })]}
      onChangeSpy={onChangeSpy}
    />,
  );

  expect(screen.queryByRole("textbox", { name: /photo/i })).not.toBeInTheDocument();
  // No owner: a casting row cannot hold an attachment, so the picker must
  // not try to attach to one.
  const props = pickerProps.at(-1);
  expect(props).toMatchObject({ compact: true, value: "library/old.jpg" });
  expect(props.ownerId).toBeUndefined();
  expect(props.ownerType).toBeUndefined();

  await userEvent.click(screen.getByRole("button", { name: "Simulate photo pick" }));
  expect(onChangeSpy.mock.lastCall[0][0].photo_file).toBe("library/pick.jpg");

  await userEvent.click(screen.getByRole("button", { name: "Simulate photo remove" }));
  expect(onChangeSpy.mock.lastCall[0][0].photo_file).toBeNull();
  await waitFor(() => expect(fetch).toHaveBeenCalled());
});

it("keeps a cast photo's focal point beside it, and clears it with a new photo", async () => {
  const onChangeSpy = vi.fn();
  render(
    <Controlled
      mediaType="anime"
      initialRows={[row({ photo_file: "library/old.jpg", photo_focus: "10% 10%" })]}
      onChangeSpy={onChangeSpy}
    />,
  );
  expect(pickerProps.at(-1)).toMatchObject({ focus: "10% 10%" });

  await userEvent.click(screen.getByRole("button", { name: "Simulate focus adjust" }));
  expect(onChangeSpy.mock.lastCall[0][0]).toMatchObject({
    photo_file: "library/old.jpg",
    photo_focus: "30% 15%",
  });

  // Two patches from one action must compose: the focus reset must not
  // undo the new key by patching the rows of the render before it.
  await userEvent.click(
    screen.getByRole("button", { name: "Simulate photo pick with focus reset" }),
  );
  expect(onChangeSpy.mock.lastCall[0][0]).toMatchObject({
    photo_file: "library/next.jpg",
    photo_focus: null,
  });
  await waitFor(() => expect(fetch).toHaveBeenCalled());
});

it("hides the seiyuu column on manga", async () => {
  // ck_casting_voice_scope: nobody voices anyone in a manga, so the UI must
  // not offer what the database will reject.
  render(<CastEditor mediaType="manga" value={[row()]} onChange={vi.fn()} />);
  expect(screen.queryByLabelText(/seiyuu/i)).not.toBeInTheDocument();
  // Manga has no seiyuu column and the character box fetches nothing on
  // mount (Fix round 1) — the only network call is useConstants'
  // unconditional /api/constants, unrelated to this component's own fetch
  // behaviour.
  await new Promise((resolve) => setTimeout(resolve, 10));
  const relevantCalls = fetch.mock.calls.filter(
    ([url]) => url.startsWith("/api/character/") || url.startsWith("/api/person/"),
  );
  expect(relevantCalls).toHaveLength(0);
});

it("shows the seiyuu column on anime and anime-movie", async () => {
  const { unmount } = render(
    <CastEditor mediaType="anime" value={[row()]} onChange={vi.fn()} />,
  );
  expect(screen.getByLabelText(/seiyuu/i)).toBeInTheDocument();
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  unmount();

  render(<CastEditor mediaType="anime-movie" value={[row()]} onChange={vi.fn()} />);
  expect(screen.getByLabelText(/seiyuu/i)).toBeInTheDocument();
  await waitFor(() => expect(fetch).toHaveBeenCalled());
});

it("shows the seiyuu column on hentai, which is voiced", async () => {
  render(<CastEditor mediaType="hentai" value={[row()]} onChange={vi.fn()} />);
  expect(screen.getByLabelText(/seiyuu/i)).toBeInTheDocument();
  await waitFor(() =>
    expect(
      fetch.mock.calls.some(([url]) => String(url).includes("scope=hentai")),
    ).toBe(true),
  );
});

it("gives one character a second seiyuu, each with its own remark", async () => {
  const onChangeSpy = vi.fn();
  const first = { person_id: "p1", person_name: "Voice A", remark: "" };
  render(
    <Controlled
      mediaType="anime"
      initialRows={[row({ character_id: "c1", character_name: "Yuki", voices: [first] })]}
      onChangeSpy={onChangeSpy}
    />,
  );

  fireEvent.click(screen.getByText("+ Another seiyuu"));
  const remarks = screen.getAllByLabelText("Voice remark");
  expect(remarks).toHaveLength(2);
  fireEvent.change(remarks[1], { target: { value: "child" } });

  expect(onChangeSpy).toHaveBeenLastCalledWith([
    expect.objectContaining({
      voices: [first, { person_id: null, person_name: "", remark: "child" }],
    }),
  ]);

  fireEvent.click(screen.getAllByLabelText("Remove seiyuu")[0]);
  expect(onChangeSpy).toHaveBeenLastCalledWith([
    expect.objectContaining({
      voices: [{ person_id: null, person_name: "", remark: "child" }],
    }),
  ]);
  await waitFor(() => expect(fetch).toHaveBeenCalled());
});

it("offers a blank seiyuu line on a new row without adding a voice to it", async () => {
  const onChange = vi.fn();
  render(<CastEditor mediaType="anime" value={[row()]} onChange={onChange} />);
  expect(screen.getAllByLabelText("Voice remark")).toHaveLength(1);
  expect(screen.queryByLabelText("Remove seiyuu")).not.toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
  await waitFor(() => expect(fetch).toHaveBeenCalled());
});

it("renumbers position after a row is removed", async () => {
  const onChange = vi.fn();
  const rows = [
    row({ character_name: "A", position: 0 }),
    row({ character_name: "B", position: 1 }),
    row({ character_name: "C", position: 2 }),
  ];
  render(<CastEditor mediaType="anime" value={rows} onChange={onChange} />);

  fireEvent.click(screen.getAllByLabelText("Remove")[0]);

  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({ character_name: "B", position: 0 }),
    expect.objectContaining({ character_name: "C", position: 1 }),
  ]);
  await waitFor(() => expect(fetch).toHaveBeenCalled());
});

it("fetches nothing for the character combobox until it is typed into", async () => {
  // Fix round 1, finding 1: GET /api/character/ used to be fetched (plus one
  // /entries call per character) on every mount, whether or not the
  // dropdown was ever opened. A row that already has a selection should
  // need no character fetch at all, and an untouched row needs none either.
  render(
    <CastEditor
      mediaType="anime"
      value={[row({ character_id: "c1", character_name: "Yuki" })]}
      onChange={vi.fn()}
    />,
  );

  // Let the seiyuu fetch (unrelated, and legitimate on mount) resolve.
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  const characterCalls = fetch.mock.calls.filter(([url]) =>
    url.startsWith("/api/character/"),
  );
  expect(characterCalls).toHaveLength(0);
  // The already-selected character still renders under its plain name with
  // no network round-trip.
  expect(screen.getByText("Yuki")).toBeInTheDocument();
});

it("shows the plain character name in the selected pill, not the entries annotation", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    mockFetch({ characters: [YUKI], entriesByCharacter: { c1: YUKI_ENTRIES } }),
  );

  render(<Controlled initialRows={[row()]} mediaType="anime" onChangeSpy={vi.fn()} />);

  const input = screen.getByPlaceholderText("Character name...");
  await user.type(input, "Yuki");
  const existingOption = await screen.findByRole("button", { name: /Yuki.*Show A/ });
  await user.click(existingOption);

  // Fix round 1, finding 2: the entries annotation is a search aid, not a
  // persistent label — once selected, the pill shows the clean name.
  await waitFor(() => expect(screen.getByText("Yuki")).toBeInTheDocument());
  expect(screen.queryByText(/Show A/)).not.toBeInTheDocument();
});

it("requires an explicit choice before minting a character with an existing name", async () => {
  const user = userEvent.setup();
  const created = { system_id: "c2", display_name: "Yuki" };
  vi.stubGlobal(
    "fetch",
    mockFetch({
      characters: [YUKI],
      entriesByCharacter: { c1: YUKI_ENTRIES },
      createdCharacter: created,
    }),
  );

  const onChange = vi.fn();
  render(
    <Controlled initialRows={[row()]} mediaType="anime" onChangeSpy={onChange} />,
  );

  const input = screen.getByPlaceholderText("Character name...");
  await user.type(input, "Yuki");

  // Both the existing character and the explicit "create new" option must
  // be offered side by side.
  const existingOption = await screen.findByRole("button", { name: /^Yuki/ });
  const createOption = await screen.findByRole("button", {
    name: 'Create new character named "Yuki"',
  });
  expect(existingOption).toBeInTheDocument();
  expect(createOption).toBeInTheDocument();

  // Typing alone (no click) must never have set a character_id — silently
  // reusing OR silently minting on typed text alone is exactly what
  // Decision G forbids.
  expect(onChange).not.toHaveBeenCalledWith(
    expect.arrayContaining([expect.objectContaining({ character_id: expect.anything() })]),
  );

  // Clicking the explicit "create new" option — not the existing match —
  // must mint a NEW character, distinct from the existing "c1" match, and
  // only a deliberate click can produce that outcome.
  await user.click(createOption);

  await waitFor(() =>
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ character_id: "c2", character_name: "Yuki" }),
    ]),
  );
  const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
  expect(lastCall[0].character_id).not.toBe("c1");

  expect(fetch).toHaveBeenCalledWith(
    "/api/character/",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ name_en: "Yuki" }),
    }),
  );
});

// NEW_CAST_CHARACTER_GENDER: a character minted from an h-comic's or a
// hentai's cast starts as 女; every other type leaves gender unset.
async function mintFrom(mediaType) {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    mockFetch({ createdCharacter: { system_id: "c9", display_name: "Aoi" } }),
  );
  render(<Controlled initialRows={[row()]} mediaType={mediaType} onChangeSpy={vi.fn()} />);
  await user.type(screen.getByPlaceholderText("Character name..."), "Aoi");
  await user.click(
    await screen.findByRole("button", { name: 'Create new character named "Aoi"' }),
  );
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      "/api/character/",
      expect.objectContaining({ method: "POST" }),
    ),
  );
  const [, init] = fetch.mock.calls.find(
    ([url, i]) => url === "/api/character/" && i?.method === "POST",
  );
  return JSON.parse(init.body);
}

it.each(["h-comic", "hentai"])(
  "mints a character from a %s cast as 女",
  async (mediaType) => {
    expect(await mintFrom(mediaType)).toEqual({ name_en: "Aoi", gender: "女" });
  },
);

it("mints a character from an anime cast with no gender", async () => {
  expect(await mintFrom("anime")).toEqual({ name_en: "Aoi" });
});

it("shows which entries an existing character already appears in", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    mockFetch({
      characters: [YUKI],
      entriesByCharacter: { c1: YUKI_ENTRIES },
    }),
  );

  render(<Controlled initialRows={[row()]} mediaType="anime" onChangeSpy={vi.fn()} />);

  const input = screen.getByPlaceholderText("Character name...");
  await user.type(input, "Yuki");

  expect(
    await screen.findByRole("button", { name: /Yuki.*Show A/ }),
  ).toBeInTheDocument();
});

it("imports another franchise entry's cast after the rows already here", async () => {
  const sourceCast = [
    {
      system_id: "cc-a",
      character_id: "c1",
      character_name: "Already Here",
      voices: [],
      role: "Main",
      position: 0,
      photo_file: null,
      photo_focus: null,
      remark: null,
    },
    {
      system_id: "cc-b",
      character_id: "c2",
      character_name: "Newcomer",
      voices: [{ person_id: "p1", person_public_id: 1, person_name: "Voice A", remark: "child" }],
      role: "Core",
      position: 1,
      photo_file: "character/s1.jpg",
      photo_focus: "30% 20%",
      remark: "season one look",
    },
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => {
      if (url.startsWith("/api/casting/sources?")) {
        expect(url).toContain("franchise_id=f1");
        expect(url).toContain("exclude=e2");
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              sources: [
                { media_type: "anime", entry_id: "e1", public_id: 1, display_name: "Season 1", cast_count: 2 },
              ],
            }),
        });
      }
      if (url === "/api/casting/anime/e1") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ cast: sourceCast }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }),
  );
  const onChangeSpy = vi.fn();
  render(
    <Controlled
      mediaType="anime"
      initialRows={[row({ character_id: "c1", character_name: "Already Here" })]}
      onChangeSpy={onChangeSpy}
      franchiseId="f1"
      entryId="e2"
    />,
  );

  const picker = await screen.findByLabelText("Import cast from");
  fireEvent.change(picker, { target: { value: "e1" } });

  await waitFor(() => expect(onChangeSpy).toHaveBeenCalled());
  const rows = onChangeSpy.mock.calls.at(-1)[0];
  expect(rows.map((r) => r.character_name)).toEqual(["Already Here", "Newcomer"]);
  // Everything is copied but the casting's own id.
  expect(rows[1]).toEqual({
    system_id: undefined,
    character_id: "c2",
    character_name: "Newcomer",
    voices: [{ person_id: "p1", person_name: "Voice A", remark: "child" }],
    role: "Core",
    position: 1,
    photo_file: "character/s1.jpg",
    photo_focus: "30% 20%",
    remark: "season one look",
  });
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Imported 1 from Season 1 (1 already in this cast)",
  );
});

it("drops the voices of an imported cast on a type nobody voices", () => {
  const source = {
    character_id: "c2",
    character_name: "Newcomer",
    voices: [{ person_id: "p1", person_name: "Voice A", remark: null }],
    role: "Main",
  };
  expect(importedRow(source, 0, false).voices).toEqual([]);
});
