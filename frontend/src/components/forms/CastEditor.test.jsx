// CastEditor's contracts that matter for a casting row: the seiyuu column
// only exists where ck_casting_voice_scope allows a person_id (anime,
// anime-movie), position stays contiguous after a removal or a move, the character
// combobox never fetches anything until it is actually used (Fix round 1,
// finding 1), the selected pill shows a plain name rather than the search
// annotation (Fix round 1, finding 2), and — the heart of Decision G — the
// character combobox never silently reuses or silently mints a name match;
// it always offers both as separate, explicit choices.
import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import CastEditor, { importedRow } from "./CastEditor";
import { castIdentityProblem } from "../../lib/castOrder";

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
function Controlled({ initialRows, mediaType, onChangeSpy, franchiseId, entryId, malLink }) {
  const [rows, setRows] = useState(initialRows);
  return (
    <CastEditor
      mediaType={mediaType}
      franchiseId={franchiseId}
      entryId={entryId}
      malLink={malLink}
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

// The import message is a role="status" line. It is not the only one: the
// drag-to-reorder list carries dnd-kit's own (empty) live region.
const importStatus = () => screen.findByText(/^Imported /, { selector: '[role="status"]' });

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

function mockFetch({
  characters = [],
  entriesByCharacter = {},
  createdCharacter,
  people = [],
} = {}) {
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
      return Promise.resolve({ ok: true, json: () => Promise.resolve(people) });
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

it("gives the character and seiyuu pickers one fixed width and the remark the rest", async () => {
  // Again the mechanism, not the picture: both name pickers carry the same
  // fixed width (so the columns line up) and neither stretches; the remark
  // is the cell that grows, and it may wrap under the seiyuu. Below sm both
  // take a full line, and the role and photo wrap under the character.
  render(<CastEditor mediaType="anime" value={[row()]} onChange={vi.fn()} />);
  const character = screen.getByLabelText("Character");
  const seiyuu = screen
    .getByPlaceholderText("Seiyuu name...")
    .closest('div[class~="sm:w-64"]');
  expect(character).toHaveClass("w-full", "sm:w-64", "min-w-0");
  expect(character.parentElement).toHaveClass("flex-wrap", "sm:flex-nowrap");
  expect(screen.getByLabelText("Seiyuu")).toHaveClass("w-full", "sm:w-auto");
  expect(character).not.toHaveClass("flex-1");
  expect(seiyuu).not.toBeNull();
  expect(seiyuu.className).toBe(character.className);
  expect(screen.getByLabelText("Remark")).toHaveClass("flex-[1_1_12rem]", "min-w-0");
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

it("hands the picker the picture the row falls back to, for show only", async () => {
  render(
    <CastEditor
      mediaType="anime"
      value={[
        row({
          character_id: "c1",
          character_name: "Ichika",
          fallback_photo_file: "characters/ichika.jpg",
          fallback_photo_focus: "10% 20%",
        }),
        row({ position: 1 }),
      ]}
      onChange={vi.fn()}
    />,
  );
  const [withFallback, without] = pickerProps.slice(-2);
  expect(withFallback).toMatchObject({
    value: "",
    fallback: { file: "characters/ichika.jpg", focus: "10% 20%" },
  });
  expect(without.fallback).toBeNull();
  await waitFor(() => expect(fetch).toHaveBeenCalled());
});

it("forgets the fallback picture when the row's character is cleared", async () => {
  const onChangeSpy = vi.fn();
  render(
    <Controlled
      mediaType="anime"
      initialRows={[
        row({
          character_id: "c1",
          character_name: "Ichika",
          fallback_photo_file: "characters/ichika.jpg",
          fallback_photo_focus: "10% 20%",
        }),
      ]}
      onChangeSpy={onChangeSpy}
    />,
  );

  await userEvent.click(screen.getByRole("button", { name: "Clear character" }));

  expect(onChangeSpy.mock.lastCall[0][0]).toMatchObject({
    character_id: null,
    fallback_photo_file: null,
    fallback_photo_focus: null,
  });
});

it("an imported row keeps the fallback picture of the same character", () => {
  const imported = importedRow(
    {
      character_id: "c1",
      fallback_photo_file: "characters/ichika.jpg",
      fallback_photo_focus: "10% 20%",
    },
    0,
    true,
  );
  expect(imported).toMatchObject({
    fallback_photo_file: "characters/ichika.jpg",
    fallback_photo_focus: "10% 20%",
  });
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

it("moves a row with its drag handle and renumbers position", async () => {
  const onChange = vi.fn();
  const rows = [
    row({ system_id: "k1", character_name: "A", position: 0 }),
    row({ character_name: "B", position: 1 }),
    row({ character_name: "C", position: 2 }),
  ];
  render(<CastEditor mediaType="anime" value={rows} onChange={onChange} />);

  fireEvent.keyDown(screen.getByLabelText("Reorder A"), { key: "ArrowUp" });
  expect(onChange).not.toHaveBeenCalled();

  fireEvent.keyDown(screen.getByLabelText("Reorder C"), { key: "ArrowUp" });
  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({ character_name: "A", position: 0 }),
    expect.objectContaining({ character_name: "C", position: 1 }),
    expect.objectContaining({ character_name: "B", position: 2 }),
  ]);
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
  const existingOption = await screen.findByRole("option", { name: /Yuki.*Show A/ });
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
  const existingOption = await screen.findByRole("option", { name: /^Yuki/ });
  const createOption = await screen.findByRole("option", {
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
      body: JSON.stringify({ name_cn: "Yuki", display_name_field: "cn" }),
    }),
  );
});

// A minted character's typed name is its CN name, shown as its display name.
// NEW_CAST_CHARACTER_GENDER: one minted from an h-comic's or a hentai's cast
// starts as 女; every other type leaves gender unset.
async function mintFrom(mediaType) {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    mockFetch({ createdCharacter: { system_id: "c9", display_name: "Aoi" } }),
  );
  render(<Controlled initialRows={[row()]} mediaType={mediaType} onChangeSpy={vi.fn()} />);
  await user.type(screen.getByPlaceholderText("Character name..."), "Aoi");
  await user.click(
    await screen.findByRole("option", { name: 'Create new character named "Aoi"' }),
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
    expect(await mintFrom(mediaType)).toEqual({
      name_cn: "Aoi",
      display_name_field: "cn",
      gender: "女",
    });
  },
);

it("mints a character from an anime cast with no gender", async () => {
  expect(await mintFrom("anime")).toEqual({ name_cn: "Aoi", display_name_field: "cn" });
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
    await screen.findByRole("option", { name: /Yuki.*Show A/ }),
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
    identity_id: null,
    identity_name: "",
    voices: [{ person_id: "p1", person_name: "Voice A", remark: "child" }],
    role: "Core",
    position: 1,
    photo_file: "character/s1.jpg",
    photo_focus: "30% 20%",
    // The source sent none, so the import knows none.
    fallback_photo_file: null,
    fallback_photo_focus: null,
    remark: "season one look",
  });
  expect(await importStatus()).toHaveTextContent(
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

it("imports a cast from the entry's MAL link and reports what it created", async () => {
  const malCast = [
    {
      character_id: "c1",
      character_public_id: 1,
      character_name: "Already Here",
      role: "Main",
      position: 0,
      photo_file: null,
      photo_focus: null,
      remark: null,
      voices: [],
    },
    {
      character_id: "c9",
      character_public_id: 9,
      character_name: "Edward Elric",
      role: "Main",
      position: 1,
      photo_file: null,
      photo_focus: null,
      remark: null,
      voices: [{ person_id: "p9", person_public_id: 9, person_name: "Romi Park", remark: null }],
    },
  ];
  const fetchSpy = vi.fn((url, init) => {
    if (url === "/api/casting/mal") {
      expect(JSON.parse(init.body)).toEqual({
        media_type: "anime",
        mal_link: "https://myanimelist.net/anime/5114",
        character_ids: ["c1"],
      });
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ cast: malCast, created_characters: 1, created_people: 1, warnings: [] }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  });
  vi.stubGlobal("fetch", fetchSpy);
  const onChangeSpy = vi.fn();
  render(
    <Controlled
      mediaType="anime"
      initialRows={[row({ character_id: "c1", character_name: "Already Here" })]}
      onChangeSpy={onChangeSpy}
      malLink="https://myanimelist.net/anime/5114"
    />,
  );

  fireEvent.click(screen.getByText("Import from MAL"));

  await waitFor(() => expect(onChangeSpy).toHaveBeenCalled());
  const rows = onChangeSpy.mock.calls.at(-1)[0];
  expect(rows.map((r) => r.character_name)).toEqual(["Already Here", "Edward Elric"]);
  expect(rows[1].voices).toEqual([{ person_id: "p9", person_name: "Romi Park", remark: "" }]);
  expect(await importStatus()).toHaveTextContent(
    "Imported 1 from MyAnimeList (1 already in this cast). Created 1 new characters and 1 new seiyuu.",
  );
});

it("sends the characters the form holds, so a hand-added one is matched, not duplicated", async () => {
  // The server reuses a held character with no MAL id when its name matches,
  // and answers with that character's own id - which the editor then skips.
  const reused = {
    character_id: "c1",
    character_public_id: 1,
    character_name: "Edward Elric",
    role: "Main",
    position: 0,
    photo_file: null,
    photo_focus: null,
    remark: null,
    voices: [],
  };
  let sent;
  vi.stubGlobal(
    "fetch",
    vi.fn((url, init) => {
      if (url === "/api/casting/mal") {
        sent = JSON.parse(init.body);
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ cast: [reused], created_characters: 0, created_people: 0, warnings: [] }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }),
  );
  const onChangeSpy = vi.fn();
  render(
    <Controlled
      mediaType="anime"
      initialRows={[
        row({ character_id: "c1", character_name: "Edward Elric" }),
        row(),
        row({ system_id: "s7", character_id: "c7", character_name: "Saved One" }),
      ]}
      onChangeSpy={onChangeSpy}
      malLink="https://myanimelist.net/anime/5114"
    />,
  );

  fireEvent.click(screen.getByText("Import from MAL"));

  await waitFor(() => expect(onChangeSpy).toHaveBeenCalled());
  // Every row's character, saved or not; a row with none sends nothing.
  expect(sent.character_ids).toEqual(["c1", "c7"]);
  const rows = onChangeSpy.mock.calls.at(-1)[0];
  expect(rows.map((r) => r.character_name)).toEqual(["Edward Elric", "", "Saved One"]);
  expect(await importStatus()).toHaveTextContent(
    "Imported 0 from MyAnimeList (1 already in this cast).",
  );
});

it("offers no MAL import without a MAL link, and shows the server's refusal", async () => {
  const { unmount } = render(<CastEditor mediaType="anime" value={[]} onChange={vi.fn()} />);
  expect(screen.queryByText("Import from MAL")).not.toBeInTheDocument();
  unmount();

  vi.stubGlobal(
    "fetch",
    vi.fn((url) =>
      url === "/api/casting/mal"
        ? Promise.resolve({
            ok: false,
            json: () => Promise.resolve({ detail: "MyAnimeList returned no cast for this entry." }),
          })
        : Promise.resolve({ ok: true, json: () => Promise.resolve([]) }),
    ),
  );
  const onChange = vi.fn();
  render(
    <CastEditor mediaType="anime" value={[]} onChange={onChange} malLink="https://myanimelist.net/anime/1" />,
  );
  fireEvent.click(screen.getByText("Import from MAL"));
  expect(await screen.findByText("MyAnimeList returned no cast for this entry.")).toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});

describe("the seiyuu picker's order", () => {
  // /api/person/ answers alphabetically, as it does for every person picker;
  // the seiyuu picker must not keep that order.
  const seiyuu = (display_name, my_rating, credit_count) => ({
    system_id: display_name,
    display_name,
    my_rating,
    credit_count,
  });
  const PEOPLE = [
    seiyuu("Aoi Hana", "S", 50),
    seiyuu("Hana", "B", 1),
    seiyuu("Hana Kana", null, 100),
    seiyuu("Hanae", "S", 2),
    seiyuu("Hanami", "B", 80),
    seiyuu("Hanazawa", "S", 30),
  ];
  const offered = () =>
    within(screen.getByRole("listbox"))
      .getAllByRole("option")
      .map((o) => o.textContent);

  async function openSeiyuuPicker() {
    vi.stubGlobal("fetch", mockFetch({ people: PEOPLE }));
    render(<Controlled initialRows={[row()]} mediaType="anime" onChangeSpy={vi.fn()} />);
    await waitFor(() =>
      expect(fetch.mock.calls.some(([url]) => url.startsWith("/api/person/"))).toBe(true),
    );
    return screen.getByPlaceholderText("Seiyuu name...");
  }

  it("ranks by rating, then by appearances, before anything is typed", async () => {
    const input = await openSeiyuuPicker();
    await userEvent.click(input);
    await waitFor(() => expect(offered()).toHaveLength(6));
    expect(offered()).toEqual(["Aoi Hana", "Hanazawa", "Hanae", "Hanami", "Hana", "Hana Kana"]);
  });

  it("puts the match first: exact, then prefix, then contains, each by rating and appearances", async () => {
    const input = await openSeiyuuPicker();
    await userEvent.type(input, "hana");
    await waitFor(() => expect(offered()).toHaveLength(6));
    expect(offered()).toEqual(["Hana", "Hanazawa", "Hanae", "Hanami", "Hana Kana", "Aoi Hana"]);
  });
});

// From lg up a cast row offers its role as chips beside the select (which
// is hidden there); below lg only the select shows. jsdom applies no media
// queries, so this pins the classes and that both edit the same value.
it("offers the casting role as chips from lg up and a select below", async () => {
  const onChange = vi.fn();
  render(<CastEditor mediaType="anime" value={[row({ role: "Main" })]} onChange={onChange} />);
  const select = screen.getByLabelText("Role");
  expect(select).toHaveClass("lg:hidden");
  const picks = screen.getByRole("group", { name: "Role quick picks" });
  expect(picks.parentElement).toHaveClass("hidden", "lg:block");
  expect(within(picks).getByRole("button", { name: "Main" })).toHaveAttribute("aria-pressed", "true");

  await userEvent.click(within(picks).getByRole("button", { name: "Core" }));
  expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ role: "Core" })]);
  await userEvent.click(within(picks).getByRole("button", { name: "Main" }));
  expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ role: "" })]);
  await waitFor(() => expect(fetch).toHaveBeenCalled());
});

describe("identity rows", () => {
  const CONAN = { system_id: "i1", display_name: "Conan", character_id: "c1" };

  // Answers the identity list/create endpoints, everything else as mockFetch.
  function stubIdentityFetch({ identities = [], created } = {}) {
    const base = mockFetch();
    const spy = vi.fn((url, init) => {
      if (url.startsWith("/api/character-identity/")) {
        if (init?.method === "POST") {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(created) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(identities) });
      }
      return base(url, init);
    });
    vi.stubGlobal("fetch", spy);
    return spy;
  }

  const identityBox = () => screen.getByRole("combobox", { name: /identity/i });
  const castRows = () => screen.getAllByTestId("cast-row");

  const SHINICHI = row({
    character_id: "c1",
    character_name: "Shinichi",
    role: "Main",
    remark: "lead",
    photo_file: "library/shinichi.jpg",
    voices: [{ person_id: "p1", person_name: "Yamaguchi", remark: "" }],
  });

  it("gives a main row no Identity box, only the character", async () => {
    stubIdentityFetch();
    render(<CastEditor mediaType="anime" value={[SHINICHI]} onChange={vi.fn()} />);
    expect(screen.queryByRole("combobox", { name: /identity/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Clear character" })).toBeInTheDocument();
    expect(screen.queryByText(/identity of/)).toBeNull();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });

  it("offers + Identity only on a row that has a character", async () => {
    stubIdentityFetch();
    render(
      <CastEditor mediaType="anime" value={[SHINICHI, row({ position: 1 })]} onChange={vi.fn()} />,
    );
    expect(screen.getAllByRole("button", { name: "+ Identity" })).toHaveLength(1);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });

  it("+ Identity inserts a blank, dashed identity row of the same character right after it, focused", async () => {
    stubIdentityFetch({ identities: [CONAN] });
    const onChangeSpy = vi.fn();
    render(
      <Controlled
        mediaType="anime"
        initialRows={[SHINICHI, row({ character_id: "c2", character_name: "Ran", position: 1 })]}
        onChangeSpy={onChangeSpy}
      />,
    );
    await userEvent.click(screen.getAllByRole("button", { name: "+ Identity" })[0]);
    const rows = onChangeSpy.mock.calls.at(-1)[0];
    expect(rows.map((r) => [r.character_id, r.identity_row || false, r.position])).toEqual([
      ["c1", false, 0],
      ["c1", true, 1],
      ["c2", false, 2],
    ]);
    expect(rows[1]).toMatchObject({
      character_name: "Shinichi",
      identity_id: null,
      identity_name: "",
      // The source row's role, so it lands in the same role group.
      role: "Main",
      remark: "",
      photo_file: null,
      voices: [],
    });
    expect(castRows()[1]).toHaveClass("border-dashed");
    expect(castRows()[0]).not.toHaveClass("border-dashed");
    expect(within(castRows()[1]).getByText(/identity of/)).toHaveTextContent("identity of Shinichi");
    expect(identityBox()).toHaveFocus();
    expect(identityBox()).toHaveAttribute("placeholder", "Identity name...");
  });

  it("picks one of the character's identities on the identity row", async () => {
    const spy = stubIdentityFetch({ identities: [CONAN] });
    const onChangeSpy = vi.fn();
    render(<Controlled mediaType="anime" initialRows={[SHINICHI]} onChangeSpy={onChangeSpy} />);
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(
        "/api/character-identity/?character_id=c1",
        expect.anything(),
      ),
    );
    await userEvent.click(screen.getByRole("button", { name: "+ Identity" }));
    await userEvent.click(identityBox());
    await userEvent.click(await screen.findByText("Conan"));
    expect(onChangeSpy.mock.calls.at(-1)[0][1]).toMatchObject({
      character_id: "c1",
      identity_id: "i1",
      identity_name: "Conan",
    });
  });

  it("creates a new identity under the row's character", async () => {
    const spy = stubIdentityFetch({ created: { system_id: "i9", display_name: "Kid" } });
    render(
      <Controlled
        mediaType="anime"
        initialRows={[row({ character_id: "c1", character_name: "Kaito" })]}
        onChangeSpy={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "+ Identity" }));
    await userEvent.type(identityBox(), "Kid");
    await userEvent.click(await screen.findByText('Create new identity named "Kid"'));
    const post = spy.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post[0]).toBe("/api/character-identity/");
    expect(JSON.parse(post[1].body)).toEqual({
      character_id: "c1",
      name_cn: "Kid",
      display_name_field: "cn",
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Clear identity" })).toBeInTheDocument(),
    );
  });

  it("renders a loaded row with an identity as an identity row", async () => {
    stubIdentityFetch({ identities: [CONAN] });
    render(
      <CastEditor
        mediaType="anime"
        value={[
          SHINICHI,
          row({
            system_id: "k2",
            character_id: "c1",
            character_name: "Shinichi",
            identity_id: "i1",
            identity_name: "Conan",
            position: 1,
          }),
        ]}
        onChange={vi.fn()}
      />,
    );
    expect(castRows()[1]).toHaveClass("border-dashed");
    expect(within(castRows()[1]).getByText(/identity of/)).toHaveTextContent("identity of Shinichi");
    // Its character is fixed: only the main row has a character box.
    expect(screen.getAllByRole("button", { name: "Clear character" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Clear identity" })).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });

  it("keeps the identity row when its character's main row is removed", async () => {
    stubIdentityFetch({ identities: [CONAN] });
    const onChangeSpy = vi.fn();
    render(
      <Controlled
        mediaType="anime"
        initialRows={[
          SHINICHI,
          row({
            character_id: "c1",
            character_name: "Shinichi",
            identity_id: "i1",
            identity_name: "Conan",
            position: 1,
          }),
        ]}
        onChangeSpy={onChangeSpy}
      />,
    );
    await userEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    const rows = onChangeSpy.mock.calls.at(-1)[0];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ character_id: "c1", identity_id: "i1", position: 0 });
    expect(castRows()[0]).toHaveClass("border-dashed");
  });

  it("keeps a loaded identity through an edit of another field", async () => {
    stubIdentityFetch({ identities: [CONAN] });
    const onChangeSpy = vi.fn();
    render(
      <Controlled
        mediaType="anime"
        initialRows={[
          row({
            system_id: "k1",
            character_id: "c1",
            character_name: "Shinichi",
            identity_id: "i1",
            identity_name: "Conan",
          }),
        ]}
        onChangeSpy={onChangeSpy}
      />,
    );
    fireEvent.change(screen.getByLabelText("Remark"), { target: { value: "cameo" } });
    expect(onChangeSpy).toHaveBeenLastCalledWith([
      expect.objectContaining({
        system_id: "k1",
        identity_id: "i1",
        identity_name: "Conan",
        remark: "cameo",
      }),
    ]);
  });

  it("takes an exact, case-insensitive name match when the box is left unpicked", async () => {
    const spy = stubIdentityFetch({ identities: [CONAN] });
    const onChangeSpy = vi.fn();
    render(<Controlled mediaType="anime" initialRows={[SHINICHI]} onChangeSpy={onChangeSpy} />);
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(
        "/api/character-identity/?character_id=c1",
        expect.anything(),
      ),
    );
    await userEvent.click(screen.getByRole("button", { name: "+ Identity" }));
    await userEvent.type(identityBox(), "conan");
    fireEvent.blur(identityBox());
    expect(onChangeSpy.mock.calls.at(-1)[0][1]).toMatchObject({
      identity_id: "i1",
      identity_name: "Conan",
    });
  });

  it("clears unmatched typed text but stays an identity row, flagged until one is picked", async () => {
    stubIdentityFetch({ identities: [CONAN] });
    const onChangeSpy = vi.fn();
    render(<Controlled mediaType="anime" initialRows={[SHINICHI]} onChangeSpy={onChangeSpy} />);
    await userEvent.click(screen.getByRole("button", { name: "+ Identity" }));
    await userEvent.type(identityBox(), "Nobody");
    fireEvent.blur(identityBox());
    expect(onChangeSpy.mock.calls.at(-1)[0][1]).toMatchObject({
      identity_id: null,
      identity_name: "",
      identity_row: true,
    });
    expect(castRows()[1]).toHaveClass("border-dashed");
    expect(within(castRows()[1]).getByText("Pick or create an identity")).toBeInTheDocument();
  });

  it("keeps a cleared loaded identity row an identity row", async () => {
    stubIdentityFetch({ identities: [CONAN] });
    const onChangeSpy = vi.fn();
    render(
      <Controlled
        mediaType="anime"
        initialRows={[
          row({ character_id: "c1", character_name: "Shinichi", identity_id: "i1", identity_name: "Conan" }),
        ]}
        onChangeSpy={onChangeSpy}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Clear identity" }));
    expect(onChangeSpy.mock.calls.at(-1)[0][0]).toMatchObject({
      identity_id: null,
      identity_row: true,
    });
    expect(castRows()[0]).toHaveClass("border-dashed");
  });

  it("appends a main-identity row for a character held only as an identity row", async () => {
    stubIdentityFetch();
    const malCast = [
      {
        character_id: "c1",
        character_name: "Shinichi",
        identity_id: null,
        role: "Main",
        position: 0,
        voices: [],
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn((url) => {
        if (url === "/api/casting/mal") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ cast: malCast, warnings: [] }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }),
    );
    const onChangeSpy = vi.fn();
    render(
      <Controlled
        mediaType="anime"
        initialRows={[
          row({
            character_id: "c1",
            character_name: "Shinichi",
            identity_id: "i1",
            identity_name: "Conan",
          }),
        ]}
        onChangeSpy={onChangeSpy}
        malLink="https://myanimelist.net/anime/1"
      />,
    );
    fireEvent.click(screen.getByText("Import from MAL"));
    await waitFor(() => expect(onChangeSpy).toHaveBeenCalled());
    const rows = onChangeSpy.mock.calls.at(-1)[0];
    expect(rows.map((r) => r.identity_id)).toEqual(["i1", null]);
  });
});

describe("castIdentityProblem", () => {
  it("names an identity row with no identity, and nothing else", () => {
    expect(castIdentityProblem([{ character_id: "c1", identity_id: null }])).toBeNull();
    expect(
      castIdentityProblem([{ character_id: "c1", identity_id: "i1", identity_row: true }]),
    ).toBeNull();
    expect(
      castIdentityProblem([{ character_id: "c1", identity_id: null, identity_row: true }]),
    ).toMatch(/Pick or create an identity/);
    expect(castIdentityProblem(undefined)).toBeNull();
  });
});

// The editor takes the cast in the order it is given - Modify hands it the
// loaded cast already role-sorted (lib/castOrder.js) - and never re-sorts it
// while it is being edited: a role change or a drag leaves rows where they are.
describe("cast order", () => {
  const names = () =>
    screen
      .getAllByRole("button", { name: /^Reorder / })
      .map((handle) => handle.getAttribute("aria-label").replace("Reorder ", ""));
  const cast = (specs) =>
    specs.map(([name, role], k) =>
      row({ system_id: `k-${name}`, character_id: `c-${name}`, character_name: name, role, position: k }),
    );

  it("does not move a row when its role changes", async () => {
    const onChangeSpy = vi.fn();
    render(
      <Controlled
        mediaType="manga"
        initialRows={cast([
          ["A", "Main"],
          ["B", "Supporting"],
          ["C", "Other"],
        ])}
        onChangeSpy={onChangeSpy}
      />,
    );
    fireEvent.change(screen.getAllByLabelText("Role")[2], { target: { value: "Main" } });
    expect(names()).toEqual(["A", "B", "C"]);
    expect(
      onChangeSpy.mock.calls.at(-1)[0].map((r) => [r.character_name, r.role, r.position]),
    ).toEqual([
      ["A", "Main", 0],
      ["B", "Supporting", 1],
      ["C", "Main", 2],
    ]);
  });

  it("puts a + Identity row directly after its source row, with the source's role", async () => {
    const onChangeSpy = vi.fn();
    render(
      <Controlled
        mediaType="manga"
        initialRows={cast([
          ["A", "Main"],
          ["B", "Supporting"],
          ["C", "Supporting"],
          ["D", "Other"],
        ])}
        onChangeSpy={onChangeSpy}
      />,
    );
    await userEvent.click(screen.getAllByRole("button", { name: "+ Identity" })[1]);
    const rows = onChangeSpy.mock.calls.at(-1)[0];
    expect(rows.map((r) => [r.character_name, r.role, Boolean(r.identity_row), r.position])).toEqual([
      ["A", "Main", false, 0],
      ["B", "Supporting", false, 1],
      ["B", "Supporting", true, 2],
      ["C", "Supporting", false, 3],
      ["D", "Other", false, 4],
    ]);
  });
});

// An identity often goes by its character's own name (a disguise, a stage
// persona). The Identity box offers that in one pick, with every name the
// character has - not just the one the row shows.
describe("create an identity with the character's name", () => {
  const SHINICHI_DETAIL = {
    system_id: "c1",
    name_en: "Kudo Shinichi",
    name_cn: "工藤新一",
    name_jp: "工藤 新一",
    name_alt: null,
    display_name_field: "en",
    display_name: "Kudo Shinichi",
    gender: "男",
  };
  const SAME_NAME = 'Create identity named "Kudo Shinichi" (same as character)';

  function stub({ identities = [], detailOk = true } = {}) {
    const base = mockFetch();
    const spy = vi.fn((url, init) => {
      if (url.startsWith("/api/character-identity/")) {
        if (init?.method === "POST") {
          const body = JSON.parse(init.body);
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                system_id: "i9",
                display_name: body.name_en || body.name_cn,
                character_id: "c1",
              }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(identities) });
      }
      if (url === "/api/character/c1") {
        return Promise.resolve({
          ok: detailOk,
          status: detailOk ? 200 : 500,
          json: () => Promise.resolve(SHINICHI_DETAIL),
        });
      }
      return base(url, init);
    });
    vi.stubGlobal("fetch", spy);
    return spy;
  }

  const SHINICHI_ROW = row({ character_id: "c1", character_name: "Kudo Shinichi", role: "Main" });
  const identityBox = () => screen.getByRole("combobox", { name: /identity/i });
  const posted = (spy) =>
    JSON.parse(spy.mock.calls.find(([, init]) => init?.method === "POST")[1].body);

  async function openNewIdentityRow(spy) {
    render(<Controlled mediaType="anime" initialRows={[SHINICHI_ROW]} onChangeSpy={vi.fn()} />);
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(
        "/api/character-identity/?character_id=c1",
        expect.anything(),
      ),
    );
    await userEvent.click(screen.getByRole("button", { name: "+ Identity" }));
    await userEvent.click(identityBox());
  }

  it("is offered on an empty identity row, before anything is typed", async () => {
    const spy = stub();
    await openNewIdentityRow(spy);
    expect(await screen.findByText(SAME_NAME)).toBeInTheDocument();
  });

  it("stays offered beside the typed create while typing something else", async () => {
    const spy = stub();
    await openNewIdentityRow(spy);
    await userEvent.type(identityBox(), "Conan");
    expect(await screen.findByText('Create new identity named "Conan"')).toBeInTheDocument();
    expect(screen.getByText(SAME_NAME)).toBeInTheDocument();
  });

  it("is not offered when the character already has an identity by that name", async () => {
    const spy = stub({
      identities: [{ system_id: "i1", display_name: "Kudo Shinichi", character_id: "c1" }],
    });
    await openNewIdentityRow(spy);
    expect(await screen.findByRole("option", { name: "Kudo Shinichi" })).toBeInTheDocument();
    expect(screen.queryByText(SAME_NAME)).toBeNull();
  });

  it("creates it with all four of the character's names and its display name, never its gender", async () => {
    const spy = stub();
    await openNewIdentityRow(spy);
    await userEvent.click(await screen.findByText(SAME_NAME));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Clear identity" })).toBeInTheDocument(),
    );
    expect(spy).toHaveBeenCalledWith("/api/character/c1", expect.anything());
    expect(posted(spy)).toEqual({
      character_id: "c1",
      name_en: "Kudo Shinichi",
      name_cn: "工藤新一",
      name_jp: "工藤 新一",
      name_alt: null,
      display_name_field: "en",
    });
    expect(screen.queryByText("Pick or create an identity")).toBeNull();
  });

  it("falls back to the row's character name when the character cannot be fetched", async () => {
    const spy = stub({ detailOk: false });
    await openNewIdentityRow(spy);
    await userEvent.click(await screen.findByText(SAME_NAME));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Clear identity" })).toBeInTheDocument(),
    );
    expect(posted(spy)).toEqual({
      character_id: "c1",
      name_cn: "Kudo Shinichi",
      display_name_field: "cn",
    });
  });
});

describe("sync from original", () => {
  const ORIGINAL = {
    character_id: "c1",
    identity_id: null,
    role: "Main",
    remark: "the original's remark",
    voices: [{ person_id: "p1", person_public_id: 1, person_name: "Kana Hanazawa", remark: null }],
    fallback_photo_file: "characters/yuki.jpg",
    fallback_photo_focus: "40% 40%",
  };

  function stubOriginals(originals) {
    const bodies = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url, init) => {
        if (url === "/api/casting/originals") {
          bodies.push(JSON.parse(init.body));
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ originals }) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }),
    );
    return bodies;
  }

  const held = (overrides = {}) =>
    row({
      character_id: "c1",
      character_name: "Yuki",
      identity_id: null,
      role: "Minor",
      remark: "row remark",
      photo_file: "library/own.jpg",
      photo_focus: "10% 20%",
      voices: [{ person_id: "p9", person_name: "Someone Else", remark: "" }],
      ...overrides,
    });

  it("replaces one row's role and seiyuu, keeps its remark, clears its photo and shows the original's", async () => {
    const bodies = stubOriginals([ORIGINAL]);
    const onChangeSpy = vi.fn();
    render(
      <Controlled mediaType="anime" entryId="e1" initialRows={[held()]} onChangeSpy={onChangeSpy} />,
    );

    fireEvent.click(screen.getByText("Sync from original"));

    await waitFor(() => expect(onChangeSpy).toHaveBeenCalled());
    expect(bodies).toEqual([
      { media_type: "anime", entry_id: "e1", rows: [{ character_id: "c1", identity_id: null }] },
    ]);
    const [synced] = onChangeSpy.mock.calls.at(-1)[0];
    // A remark never comes down from the original, even when it sends one.
    expect(synced).toMatchObject({
      role: "Main",
      remark: "row remark",
      photo_file: null,
      photo_focus: null,
      // Shown in the photo cell, never saved: the row falls back to it.
      fallback_photo_file: "characters/yuki.jpg",
      fallback_photo_focus: "40% 40%",
      voices: [{ person_id: "p1", person_name: "Kana Hanazawa", remark: "" }],
    });
    expect(
      await screen.findByText(/^Synced 1 row from the original/, { selector: '[role="status"]' }),
    ).toBeInTheDocument();
  });

  it("leaves a row's value where the original has none, but still clears the photo", async () => {
    stubOriginals([{ ...ORIGINAL, role: null, remark: "  ", voices: [] }]);
    const onChangeSpy = vi.fn();
    render(<Controlled mediaType="anime" initialRows={[held()]} onChangeSpy={onChangeSpy} />);

    fireEvent.click(screen.getByText("Sync from original"));

    await waitFor(() => expect(onChangeSpy).toHaveBeenCalled());
    const [synced] = onChangeSpy.mock.calls.at(-1)[0];
    expect(synced).toMatchObject({
      role: "Minor",
      remark: "row remark",
      photo_file: null,
      photo_focus: null,
      voices: [{ person_id: "p9", person_name: "Someone Else", remark: "" }],
    });
  });

  it("syncs every row with a character in one request, skipping a row with none", async () => {
    const identityOriginal = {
      character_id: "c2",
      identity_id: "i2",
      role: "Core",
      remark: "as the disguise",
      voices: [],
    };
    const bodies = stubOriginals([ORIGINAL, identityOriginal]);
    const onChangeSpy = vi.fn();
    render(
      <Controlled
        mediaType="anime"
        initialRows={[
          held(),
          row({ position: 1 }),
          held({
            position: 2,
            character_id: "c2",
            character_name: "Shinichi",
            identity_id: "i2",
            identity_name: "Conan",
          }),
        ]}
        onChangeSpy={onChangeSpy}
      />,
    );

    fireEvent.click(screen.getByText("Sync all from original"));

    await waitFor(() => expect(onChangeSpy).toHaveBeenCalled());
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual({
      media_type: "anime",
      entry_id: null,
      rows: [
        { character_id: "c1", identity_id: null },
        { character_id: "c2", identity_id: "i2" },
      ],
    });
    const rows = onChangeSpy.mock.calls.at(-1)[0];
    expect(rows[0]).toMatchObject({ role: "Main", photo_file: null });
    expect(rows[1]).toMatchObject({ character_id: null, role: "" });
    expect(rows[2]).toMatchObject({
      role: "Core",
      remark: "row remark",
      photo_file: null,
      voices: [{ person_id: "p9", person_name: "Someone Else", remark: "" }],
    });
  });

  it("shows the server's refusal and leaves the rows alone", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url) =>
        url === "/api/casting/originals"
          ? Promise.resolve({
              ok: false,
              json: () => Promise.resolve({ detail: "Unknown casting media type: x" }),
            })
          : Promise.resolve({ ok: true, json: () => Promise.resolve([]) }),
      ),
    );
    const onChange = vi.fn();
    render(<CastEditor mediaType="anime" value={[held()]} onChange={onChange} />);

    fireEvent.click(screen.getByText("Sync all from original"));

    expect(await screen.findByText("Unknown casting media type: x")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("offers no sync on a row with no character", () => {
    render(<CastEditor mediaType="anime" value={[row()]} onChange={vi.fn()} />);
    expect(screen.queryByText("Sync from original")).not.toBeInTheDocument();
    expect(screen.queryByText("Sync all from original")).not.toBeInTheDocument();
  });
});
