// Frontend: form component for an entry's cast (character + seiyuu list +
// role + position + photo + remark). Controlled, like NovelUnitsEditor: the parent
// owns `value` and receives every change through `onChange`. CastEditor
// never calls the API to save a cast list — only to search/create the
// characters and people its two comboboxes reference.
//
// Two kinds of row. A main row is the character as itself: a Character box.
// An identity row is the character cast as one of its other identities
// (Edogawa Conan of Kudo Shinichi): drawn with a dashed border, its character
// fixed and read as "identity of <character>", and an Identity box to pick or
// create the identity. "+ Identity" on a row adds one right after it. A row
// is an identity row when it holds an identity_id or carries identity_row,
// the form-only marker "+ Identity" sets (useReplaceCasting never sends it).
//
// Rows are shown in the order given. Modify hands over a loaded cast in the
// detail page's order (lib/castOrder.js); nothing here re-sorts while editing.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import ComboBox from "./ComboBox";
import QuickPicks from "./QuickPicks";
import ImagePicker from "./ImagePicker";
import { DragHandle, SortableItem, SortableList, arrayMove } from "../ui/Sortable";
import { useConstants } from "../../config/useConstants";
import { endpoints } from "../../api/endpoints";
import { buildCreateRequest } from "../../lib/ensureSourceValues";
import { byRatingThenAppearances } from "../../lib/peopleOrder";
import { CHARACTER_ROLES, NEW_CAST_CHARACTER_GENDER } from "../../config/fieldOptions";
import { mediaTypeLabel } from "../../config/mediaRegistry";
import { MISSING_IDENTITY_MESSAGE, isIdentityRow } from "../../lib/castOrder";

// A synthetic ComboBox item id, distinguishable from every real
// character's UUID, that stands for "mint a brand new character with this
// typed name" rather than "select this existing character".
const CREATE_CHARACTER_PREFIX = "__create_character__:";

// The same idea for an identity: "mint a new identity of this row's
// character with this typed name". An identity is always created under the
// row's character - never free-standing.
const CREATE_IDENTITY_PREFIX = "__create_identity__:";

// "Mint an identity of this row's character under the character's own
// names" - all four and its display choice, fetched from the character when
// picked. An identity often goes by its character's name (a disguise, a
// stage persona), and typing it would carry only the one name the row shows.
const CREATE_SAME_NAME_IDENTITY = "__create_identity_same_name__";

// Debounced the same way useGlobalMediaSearch debounces: one request per
// keystroke is one too many, and GET /api/character/?name= is the whole
// reason this component no longer has to download every character just to
// offer suggestions.
const CHARACTER_SEARCH_DEBOUNCE_MS = 250;

// ck_casting_voice_scope: a character_casting_voice row only on media_type IN
// ('anime', 'anime-movie', 'hentai'). Nobody voices anyone in a manga or
// novel, so the seiyuu column must not offer what the database will reject.
const SEIYUU_MEDIA_TYPES = new Set(["anime", "anime-movie", "hentai"]);

// No width here: each cell states its own. A shared `w-full` beside a cell's
// own `w-28` is two width utilities on one element, and Tailwind resolves
// that by stylesheet order, not class order - `w-full` won, so the
// non-shrinking Role select took the whole row and pushed the photo, remark
// and remove controls out of the card.
const cellCls =
  "border border-border rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand bg-surface";

// The character picker and every seiyuu picker: one width, about a long CJK
// name, so the two columns line up. It may shrink (min-w-0) but never grows,
// so a narrow form squeezes the picker instead of overflowing, and a wide one
// gives the spare room to the remark.
const NAME_CELL = "w-64 min-w-0";

// The POST body for a character minted from this editor: the typed name as
// its CN name and display name, plus the gender NEW_CAST_CHARACTER_GENDER
// gives this media type, if any. A MAL import mints with MAL's name_en
// instead - that one is MAL's romanisation, this one is what the admin typed.
export function newCharacterBody(name, mediaType) {
  const body = { name_cn: name, display_name_field: "cn" };
  const gender = NEW_CAST_CHARACTER_GENDER[mediaType];
  return gender ? { ...body, gender } : body;
}

// One seiyuu on a cast row. A row may hold several - a child and an adult
// voice, a recast - each with a remark saying which.
function emptyVoice() {
  return { person_id: null, person_name: "", remark: "" };
}

// What a row's seiyuu cell renders: its voices, or one blank line to type
// into when it has none yet. The blank line is not in the row until typed
// into, so an untouched row saves with no voices.
function voiceLines(row) {
  return row.voices && row.voices.length ? row.voices : [emptyVoice()];
}

// A row of another entry's cast, as this editor holds one: everything is
// copied - photo and remark included - except the casting's own id, so the
// save makes a new casting here. Voices are dropped on a type nobody voices.
export function importedRow(source, position, voiced) {
  return {
    system_id: undefined,
    character_id: source.character_id,
    character_name: source.character_name || "",
    identity_id: source.identity_id || null,
    identity_name: source.identity_name || "",
    voices: voiced
      ? (source.voices || []).map((voice) => ({
          person_id: voice.person_id,
          person_name: voice.person_name || "",
          remark: voice.remark || "",
        }))
      : [],
    role: source.role || "",
    position,
    photo_file: source.photo_file || null,
    photo_focus: source.photo_focus || null,
    remark: source.remark || "",
  };
}

// The identity row "+ Identity" adds after `source`: the same character and
// role, so it sits in the same role group, and nothing else - the identity is
// still to be picked, and photo, remark and voices are the identity's own.
function identityRowOf(source, position) {
  return {
    ...emptyRow(position),
    character_id: source.character_id,
    character_name: source.character_name || "",
    role: source.role || "",
    identity_row: true,
  };
}

function emptyRow(position) {
  return {
    system_id: undefined,
    character_id: null,
    character_name: "",
    identity_id: null,
    identity_name: "",
    voices: [],
    role: "",
    position,
    photo_file: null,
    photo_focus: null,
    remark: "",
  };
}

// `franchiseId` and `entryId` drive "Import cast from": the other entries of
// the franchise that have a cast, `entryId` (absent on Add) left out.
// `malLink` - the entry's own MyAnimeList link - drives "Import from MAL".
export default function CastEditor({
  mediaType,
  value,
  onChange,
  franchiseId,
  entryId,
  malLink,
}) {
  const rows = value || [];
  const showSeiyuu = SEIYUU_MEDIA_TYPES.has(mediaType);

  // CHARACTER_ROLES (config/fieldOptions.js) is the fallback until
  // /api/constants answers, and is refreshed in place from its
  // `character_role` key; the constants payload wins when it has one.
  const constants = useConstants();
  const roleOptions =
    constants.character_role && constants.character_role.length
      ? constants.character_role
      : CHARACTER_ROLES;

  // Per-row character search results, keyed by row index: {system_id,
  // display_name, entryNames}[]. Populated only by typing (see
  // scheduleCharacterSearch) — nothing is fetched for the character
  // combobox on mount, and a row that already has a selection needs no
  // fetch at all (see characterItems).
  const [characterResults, setCharacterResults] = useState({});
  const searchTimers = useRef({});
  useEffect(
    () => () => {
      Object.values(searchTimers.current).forEach(clearTimeout);
    },
    [],
  );

  // character_id -> that character's identities, fetched once per character
  // the first time a row with it is shown.
  const [identitiesByCharacter, setIdentitiesByCharacter] = useState({});
  const characterIdsKey = rows.map((r) => r.character_id).filter(Boolean).join(",");
  useEffect(() => {
    const missing = [...new Set(characterIdsKey.split(",").filter(Boolean))].filter(
      (id) => !(id in identitiesByCharacter),
    );
    missing.forEach((id) => {
      const qs = new URLSearchParams({ character_id: id }).toString();
      fetch(endpoints.characterIdentity.list(qs), { credentials: "include" })
        .then((res) => (res.ok ? res.json() : []))
        .then((list) =>
          setIdentitiesByCharacter((prev) => ({ ...prev, [id]: Array.isArray(list) ? list : [] })),
        )
        .catch(() => {
          /* best effort - the identity box offers only "create" */
        });
    });
    // identitiesByCharacter is read, not depended on: a fetched character is
    // never fetched again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterIdsKey]);

  const [seiyuuList, setSeiyuuList] = useState([]);

  // Existing seiyuu, scoped to this media type exactly like every other
  // person source (PersonRoleIn.scope IS the media type). Not fetched at
  // all for manga/novel, where the column never renders.
  useEffect(() => {
    if (!showSeiyuu) return;
    let cancelled = false;
    const qs = new URLSearchParams({ role: "seiyuu", scope: mediaType }).toString();
    fetch(endpoints.person.list(qs), { credentials: "include" })
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => {
        if (!cancelled) setSeiyuuList(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        /* best effort — the seiyuu combobox still works empty */
      });
    return () => {
      cancelled = true;
    };
  }, [showSeiyuu, mediaType]);

  // What every seiyuu box offers, best first: my rating, then the most
  // appearances (credit_count counts castings). /api/person/ answers
  // alphabetically for every person picker, so the order is set here, and
  // the box's rankMatches puts what the typed text matches exact, then
  // prefix, then contains, keeping this order inside each tier.
  const seiyuuItems = useMemo(
    () =>
      byRatingThenAppearances(seiyuuList).map((p) => ({
        id: p.system_id,
        label: p.display_name,
        searchText: p.display_name,
      })),
    [seiyuuList],
  );

  // The photo picker reports two changes from one action - the new key, then
  // the cleared focus - before the parent has re-rendered, so each patch
  // applies to the rows the previous one produced, not to this render's
  // (stale) `rows`, or the second would undo the first.
  const latestRows = useRef(rows);
  useEffect(() => {
    latestRows.current = value || [];
  }, [value]);
  const updateRow = (i, patch) => {
    const next = latestRows.current.map((r, j) =>
      j === i ? { ...r, ...patch } : r,
    );
    latestRows.current = next;
    onChange(next);
  };

  const addRow = () => onChange([...rows, emptyRow(rows.length)]);

  // Inserts an identity row of row i's character directly after it, then
  // focuses its Identity box once the parent has rendered it.
  const rootRef = useRef(null);
  const focusIdentityOf = useRef(null);
  const addIdentityRow = (i) => {
    const current = latestRows.current;
    const next = [
      ...current.slice(0, i + 1),
      identityRowOf(current[i], i + 1),
      ...current.slice(i + 1),
    ].map((r, k) => ({ ...r, position: k }));
    latestRows.current = next;
    focusIdentityOf.current = i + 1;
    onChange(next);
  };
  useLayoutEffect(() => {
    const target = focusIdentityOf.current;
    if (target == null) return;
    const input = rootRef.current?.querySelector(
      `[data-identity-cell="${target}"] input`,
    );
    if (!input) return;
    focusIdentityOf.current = null;
    input.focus();
  });

  // Other entries of this franchise with a cast to import. Refetched when the
  // form's franchise changes; a form with no franchise has none.
  const [castSources, setCastSources] = useState([]);
  const [importMessage, setImportMessage] = useState("");
  useEffect(() => {
    if (!franchiseId) return undefined;
    let cancelled = false;
    const params = { franchise_id: franchiseId };
    if (entryId) params.exclude = entryId;
    fetch(endpoints.casting.sources(new URLSearchParams(params).toString()), {
      credentials: "include",
    })
      .then((res) => (res.ok ? res.json() : { sources: [] }))
      .then((payload) => {
        if (!cancelled) setCastSources(payload?.sources || []);
      })
      .catch(() => {
        /* best effort — the editor works without an import list */
      });
    return () => {
      cancelled = true;
    };
  }, [franchiseId, entryId]);

  // A stale list from a franchise the form has since cleared is not shown.
  const importSources = franchiseId ? castSources : [];

  // Appends imported cast rows after the rows already here, skipping a
  // character this cast already has (uq_character_casting). Nothing is saved:
  // the rows land in the form like typed ones, to be edited and then saved.
  function appendCast(cast, from, note = "") {
    const current = latestRows.current;
    // The appearance is (character, identity): the same character may be
    // cast twice under different identities (uq_character_casting).
    const appearance = (r) => `${r.character_id}:${r.identity_id || ""}`;
    const held = new Set(current.filter((r) => r.character_id).map(appearance));
    const incoming = (cast || []).filter((r) => !held.has(appearance(r)));
    const next = [
      ...current,
      ...incoming.map((r, k) => importedRow(r, current.length + k, showSeiyuu)),
    ];
    latestRows.current = next;
    onChange(next);
    const skipped = (cast || []).length - incoming.length;
    setImportMessage(
      `Imported ${incoming.length} from ${from}` +
        (skipped ? ` (${skipped} already in this cast)` : "") +
        `.${note} Save to keep them.`,
    );
  }

  async function importCast(source) {
    try {
      const res = await fetch(endpoints.casting.get(source.media_type, source.entry_id), {
        credentials: "include",
      });
      if (!res.ok) return;
      const payload = await res.json();
      appendCast(payload?.cast, source.display_name);
    } catch {
      /* leave the cast untouched — the admin can retry */
    }
  }

  // The server matches MAL's characters and seiyuu to existing rows by MAL
  // id (a seiyuu by name too), creating the missing ones, and answers with
  // cast rows; Japanese voices only. It can take a while on a long cast.
  // The characters this form holds go with the request: one with no MAL id
  // whose name matches is reused rather than minted again, and comes back
  // under its own id, so appendCast skips it like any held character.
  const [malImporting, setMalImporting] = useState(false);
  async function importFromMal() {
    setMalImporting(true);
    setImportMessage("Fetching the cast from MyAnimeList…");
    const characterIds = latestRows.current.map((r) => r.character_id).filter(Boolean);
    try {
      const res = await fetch(endpoints.casting.fromMal(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_type: mediaType,
          mal_link: malLink,
          character_ids: characterIds,
        }),
        credentials: "include",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setImportMessage(payload?.detail || "MyAnimeList import failed.");
        return;
      }
      const created = [
        payload.created_characters ? `${payload.created_characters} new characters` : "",
        payload.created_people ? `${payload.created_people} new seiyuu` : "",
      ].filter(Boolean);
      const warnings = payload.warnings?.length ? ` ${payload.warnings.join(" ")}` : "";
      appendCast(
        payload.cast,
        "MyAnimeList",
        (created.length ? ` Created ${created.join(" and ")}.` : "") + warnings,
      );
    } catch {
      setImportMessage("MyAnimeList import failed.");
    } finally {
      setMalImporting(false);
    }
  }

  // Patch voice `v` of row `i`, materialising the blank line voiceLines()
  // shows for a row that has none.
  const updateVoice = (i, v, patch) => {
    const row = latestRows.current[i];
    const voices = voiceLines(row).map((voice, k) =>
      k === v ? { ...voice, ...patch } : voice,
    );
    updateRow(i, { voices });
  };
  const addVoice = (i) =>
    updateRow(i, { voices: [...voiceLines(latestRows.current[i]), emptyVoice()] });
  const removeVoice = (i, v) =>
    updateRow(i, {
      voices: (latestRows.current[i].voices || []).filter((_, k) => k !== v),
    });

  // position is 0-based and must stay contiguous — a gap here (0, 2) is a
  // gap in the saved order, since Task 9/10 write `position` straight from
  // whatever this editor last reported.
  const removeRow = (i) =>
    onChange(
      rows.filter((_, j) => j !== i).map((r, j) => ({ ...r, position: j })),
    );

  // A row is dragged by its handle (components/ui/Sortable, the reorder
  // control every list uses) and the rows renumbered, the same shape as
  // NovelUnitsEditor's move. A row not saved yet has no system_id, so it is
  // identified by its index until it has one.
  const rowIds = rows.map((r, i) => r.system_id || `new-${i}`);
  const move = (from, to) =>
    onChange(arrayMove(rows, from, to).map((r, k) => ({ ...r, position: k })));

  // Searches GET /api/character/?name= (Fix round 1: this used to fetch the
  // whole table). Debounced per row, and fetches /entries ONLY for the
  // handful of candidates the search actually returns — never for a row's
  // already-selected character, which needs no disambiguating any more.
  function scheduleCharacterSearch(i, text) {
    clearTimeout(searchTimers.current[i]);
    const trimmed = text.trim();
    if (!trimmed) {
      setCharacterResults((prev) => ({ ...prev, [i]: [] }));
      return;
    }
    searchTimers.current[i] = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ name: trimmed }).toString();
        const res = await fetch(endpoints.character.list(qs), {
          credentials: "include",
        });
        if (!res.ok) return;
        const list = await res.json();
        const withEntries = await Promise.all(
          (Array.isArray(list) ? list : []).map(async (c) => {
            let entryNames = [];
            try {
              const eres = await fetch(endpoints.character.entries(c.system_id), {
                credentials: "include",
              });
              if (eres.ok) {
                const payload = await eres.json();
                const groups = Array.isArray(payload?.groups) ? payload.groups : [];
                entryNames = groups.flatMap((g) =>
                  (g.entries || []).map((e) => e.display_name),
                );
              }
            } catch {
              /* best effort — a missing entries list just omits the hint */
            }
            return { ...c, entryNames };
          }),
        );
        setCharacterResults((prev) => ({ ...prev, [i]: withEntries }));
      } catch {
        /* best effort — the character combobox still works empty */
      }
    }, CHARACTER_SEARCH_DEBOUNCE_MS);
  }

  function characterItems(row, i) {
    const typed = (row.character_name || "").trim();
    const items = [];
    // The already-selected character, if any, shown with its PLAIN name —
    // the entries annotation is a search aid, not a persistent label (Fix
    // round 1, finding 2). This needs no fetch: the row already carries
    // both id and name locally.
    if (row.character_id) {
      items.push({
        id: row.character_id,
        label: row.character_name || "",
        searchText: row.character_name || "",
      });
    }
    // Server-searched candidates, annotated with the entries they already
    // appear in (Decision G: the admin needs to see WHICH "Yuki" a match is
    // before deciding whether to reuse it). searchText is pinned to the
    // typed query rather than the candidate's own display_name, because the
    // server may have matched through name_jp/name_cn/name_alt — a column
    // ComboBox's own client-side re-filter never sees.
    for (const c of characterResults[i] || []) {
      items.push({
        id: c.system_id,
        label:
          c.entryNames && c.entryNames.length
            ? `${c.display_name} — in: ${c.entryNames.join(", ")}`
            : c.display_name,
        searchText: typed,
      });
    }
    // Decision G, the heart of this component: a name match is OFFERED,
    // never assumed. "Create new character named X" stays a separate,
    // deliberate option alongside any matches — even an exact one — because
    // POST /api/character is a plain create, not find-or-create: silently
    // reusing a match would fuse two unrelated casts, silently minting
    // would split one.
    if (typed) {
      items.push({
        id: `${CREATE_CHARACTER_PREFIX}${typed}`,
        label: `Create new character named "${typed}"`,
        searchText: typed,
      });
    }
    return items;
  }

  async function handleCharacterSelect(i, id) {
    if (id.startsWith(CREATE_CHARACTER_PREFIX)) {
      const name = id.slice(CREATE_CHARACTER_PREFIX.length);
      try {
        const res = await fetch(endpoints.character.create(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newCharacterBody(name, mediaType)),
          credentials: "include",
        });
        if (!res.ok) return;
        const created = await res.json();
        updateRow(i, {
          character_id: created.system_id,
          character_name: created.display_name || name,
          identity_id: null,
          identity_name: "",
        });
      } catch {
        /* leave the row untouched — the admin can retry */
      }
      return;
    }
    const found = (characterResults[i] || []).find((c) => c.system_id === id);
    updateRow(i, {
      character_id: id,
      character_name: found?.display_name || "",
      identity_id: null,
      identity_name: "",
    });
  }

  function identityItems(row) {
    const typed = (row.identity_name || "").trim();
    const items = (identitiesByCharacter[row.character_id] || []).map((identity) => ({
      id: identity.system_id,
      label: identity.display_name,
      searchText: identity.display_name,
    }));
    // A row loaded with an identity shows its pill before the list arrives.
    if (row.identity_id && !items.some((item) => item.id === row.identity_id)) {
      items.push({
        id: row.identity_id,
        label: row.identity_name || "",
        searchText: row.identity_name || "",
      });
    }
    const characterName = (row.character_name || "").trim();
    // The typed create, unless what is typed is the character's own name:
    // the same-name item below makes that one, with every name it has.
    if (
      typed &&
      !row.identity_id &&
      typed !== characterName &&
      !items.some((item) => item.label === typed)
    ) {
      items.push({
        id: `${CREATE_IDENTITY_PREFIX}${typed}`,
        label: `Create new identity named "${typed}"`,
        searchText: typed,
      });
    }
    // Offered, typed text or not, while the character has no identity by
    // its own name. searchText is the typed text, as for the create item
    // above, so the box's filter never hides it.
    if (
      characterName &&
      !row.identity_id &&
      !items.some((item) => item.label === characterName)
    ) {
      items.push({
        id: CREATE_SAME_NAME_IDENTITY,
        label: `Create identity named "${characterName}" (same as character)`,
        searchText: typed,
      });
    }
    return items;
  }

  // The POST body for an identity under the character's own names. The row
  // carries only the displayed name, so the character is read for the rest;
  // if that fails, the displayed name goes in as the CN name, the shape the
  // typed create uses. Never the gender: unset means "the character's".
  async function sameNameIdentityBody(row) {
    try {
      const res = await fetch(endpoints.character.detail(row.character_id), {
        credentials: "include",
      });
      if (res.ok) {
        const character = await res.json();
        return {
          character_id: row.character_id,
          name_en: character.name_en ?? null,
          name_cn: character.name_cn ?? null,
          name_jp: character.name_jp ?? null,
          name_alt: character.name_alt ?? null,
          display_name_field: character.display_name_field ?? null,
        };
      }
    } catch {
      /* fall through to the displayed name */
    }
    return { character_id: row.character_id, name_cn: row.character_name, display_name_field: "cn" };
  }

  async function handleIdentitySelect(i, id) {
    const row = latestRows.current[i];
    if (id !== CREATE_SAME_NAME_IDENTITY && !id.startsWith(CREATE_IDENTITY_PREFIX)) {
      const found = (identitiesByCharacter[row.character_id] || []).find((x) => x.system_id === id);
      updateRow(i, {
        identity_id: id,
        identity_name: found?.display_name || "",
        identity_row: true,
      });
      return;
    }
    const sameName = id === CREATE_SAME_NAME_IDENTITY;
    const name = sameName ? row.character_name : id.slice(CREATE_IDENTITY_PREFIX.length);
    try {
      const body = sameName
        ? await sameNameIdentityBody(row)
        : { character_id: row.character_id, name_cn: name, display_name_field: "cn" };
      const res = await fetch(endpoints.characterIdentity.create(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (!res.ok) return;
      const created = await res.json();
      setIdentitiesByCharacter((prev) => ({
        ...prev,
        [row.character_id]: [...(prev[row.character_id] || []), created],
      }));
      updateRow(i, {
        identity_id: created.system_id,
        identity_name: created.display_name || name,
        identity_row: true,
      });
    } catch {
      /* leave the row untouched - the admin can retry */
    }
  }

  // Leaving the identity box with text that was typed and never picked: an
  // exact (case-insensitive) display-name match among THIS character's
  // identities is taken; anything else is cleared, so the box never shows a
  // name the row does not hold. The row stays an identity row either way, and
  // one with no identity blocks the save (castIdentityProblem). Creating one
  // is the explicit "Create new identity" item.
  function resolveIdentity(i, e) {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    const row = latestRows.current[i];
    const typed = (row?.identity_name || "").trim();
    if (!row || row.identity_id || !typed) return;
    const match = (identitiesByCharacter[row.character_id] || []).find(
      (identity) => (identity.display_name || "").toLowerCase() === typed.toLowerCase(),
    );
    updateRow(
      i,
      match
        ? { identity_id: match.system_id, identity_name: match.display_name, identity_row: true }
        : { identity_id: null, identity_name: "", identity_row: true },
    );
  }

  // Seiyuu find-or-create: leaving the field with typed, unresolved text
  // reuses a matching existing seiyuu, or mints one via the same
  // create-request shape ensureSourceValues.js uses for every other typed
  // person field. Splitting one voice actor across two rows would split
  // their whole body of work, so — unlike the character box — this never
  // asks; it just does the right thing.
  async function resolveSeiyuu(i, v, e) {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    const row = rows[i];
    const voice = row ? voiceLines(row)[v] : null;
    if (!voice || voice.person_id) return;
    const name = (voice.person_name || "").trim();
    if (!name) return;
    const existing = seiyuuList.find(
      (p) => (p.display_name || "").trim().toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      updateVoice(i, v, {
        person_id: existing.system_id,
        person_name: existing.display_name,
      });
      return;
    }
    try {
      const [url, init] = buildCreateRequest(
        { kind: "person", role: "seiyuu", scope: mediaType },
        name,
      );
      const res = await fetch(url, init);
      if (!res.ok) return;
      const created = await res.json();
      setSeiyuuList((prev) => [...prev, created]);
      updateVoice(i, v, {
        person_id: created.system_id,
        person_name: created.display_name || name,
      });
    } catch {
      /* leave the row untouched — the admin can retry */
    }
  }

  return (
    <div className="space-y-2" ref={rootRef}>
      <SortableList ids={rowIds} onMove={move}>
        {rows.map((row, i) => {
          const asIdentity = isIdentityRow(row);
          return (
          <SortableItem
            key={rowIds[i]}
            id={rowIds[i]}
            data-testid="cast-row"
            // Dashed, so an identity row reads as the same character under
            // another name rather than as one more character.
            className={`flex gap-2 items-start border rounded-lg p-2 bg-surface ${
              asIdentity ? "border-dashed border-border-strong" : "border-border"
            }`}
          >
            <DragHandle
              label={
                (asIdentity ? row.identity_name : "") ||
                row.character_name ||
                `cast member ${i + 1}`
              }
              className="pt-2"
            />

            {/* Two lines, so no cell is squeezed to nothing on a narrow form:
                who the character is and what they are here, then who voices
                them and the casting's remark. The character and seiyuu
                pickers share one width (NAME_CELL), about a long CJK name, so
                the two columns line up and the remark takes what is left. The
                second line wraps the remark under the seiyuu when even that
                is too tight, and a picker shrinks below its width rather than
                overflow. */}
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              <div className="flex gap-1.5 items-center">
                {asIdentity ? (
                  <>
                    {/* The character is fixed on an identity row: to cast
                        someone else, remove the row. */}
                    <span className={NAME_CELL + " text-sm text-text-muted truncate"}>
                      identity of{" "}
                      <span className="text-text font-medium">
                        {row.character_name || "Unknown"}
                      </span>
                    </span>
                    {/* Always one of THIS character's identities, and
                        "Create new identity" makes it under it. */}
                    <div
                      className={NAME_CELL + " flex flex-col gap-0.5"}
                      aria-label="Identity"
                      data-identity-cell={i}
                      onBlur={(e) => resolveIdentity(i, e)}
                    >
                      <ComboBox
                        items={identityItems(row)}
                        selectedId={row.identity_id || null}
                        inputText={row.identity_name || ""}
                        onSelect={(id) => handleIdentitySelect(i, id)}
                        onType={(text) =>
                          updateRow(i, { identity_name: text, identity_id: null, identity_row: true })
                        }
                        onClear={() =>
                          updateRow(i, { identity_id: null, identity_name: "", identity_row: true })
                        }
                        placeholder="Identity name..."
                        clearLabel="Clear identity"
                        ariaLabel="Identity"
                      />
                      {!row.identity_id && (
                        <span className="text-[11px] text-danger">
                          {MISSING_IDENTITY_MESSAGE}
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className={NAME_CELL} aria-label="Character">
                      <ComboBox
                        items={characterItems(row, i)}
                        selectedId={row.character_id || null}
                        inputText={row.character_name || ""}
                        onSelect={(id) => handleCharacterSelect(i, id)}
                        onType={(text) => {
                          updateRow(i, { character_name: text });
                          scheduleCharacterSearch(i, text);
                        }}
                        onClear={() => {
                          updateRow(i, {
                            character_id: null,
                            character_name: "",
                            identity_id: null,
                            identity_name: "",
                          });
                          setCharacterResults((prev) => ({ ...prev, [i]: [] }));
                        }}
                        placeholder="Character name..."
                        clearLabel="Clear character"
                      />
                    </div>
                    {/* A main row is the character as itself; another
                        identity of it is a row of its own, added here. */}
                    {row.character_id && (
                      <button
                        type="button"
                        className="shrink-0 text-[11px] text-brand hover:underline"
                        onClick={() => addIdentityRow(i)}
                      >
                        + Identity
                      </button>
                    )}
                  </>
                )}
                {/* The casting's role, twice over: a select below lg, where
                    the row has no room to spare, and one chip per role from
                    lg up, where it has. Both edit the same value; clicking
                    the pressed chip clears it, as "—" does in the select. */}
                <select
                  className={cellCls + " shrink-0 w-28 lg:hidden"}
                  value={row.role || ""}
                  onChange={(e) => updateRow(i, { role: e.target.value })}
                  aria-label="Role"
                >
                  <option value="">—</option>
                  {roleOptions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <div className="hidden lg:block shrink-0">
                  <QuickPicks
                    label="Role quick picks"
                    options={roleOptions}
                    value={row.role || ""}
                    onChange={(role) => updateRow(i, { role })}
                  />
                </div>

                {/* No ownerType or ownerId: a casting cannot own an attachment,
                    because replace_casting re-inserts every row on each save. The
                    picked key rides in photo_file with the cast PUT, and the image
                    library counts it as in use by reading that column. Its focal
                    point rides beside it in photo_focus. */}
                <div role="group" aria-label="Photo" className="shrink-0">
                  <ImagePicker
                    compact
                    value={row.photo_file || ""}
                    onChange={(key) => updateRow(i, { photo_file: key || null })}
                    focus={row.photo_focus || null}
                    onFocusChange={(focus) => updateRow(i, { photo_focus: focus })}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 items-start">
                {showSeiyuu ? (
                  <div
                    className="flex-[0_1_auto] min-w-0 flex flex-col gap-1"
                    aria-label="Seiyuu"
                  >
                    {voiceLines(row).map((voice, v) => (
                      <div
                        // By index: a voice is never reordered, and keying on
                        // person_id would remount the box the moment one is picked.
                        key={v}
                        className="flex gap-1 items-start"
                        onBlur={(e) => resolveSeiyuu(i, v, e)}
                      >
                        <div className={NAME_CELL}>
                          <ComboBox
                            items={seiyuuItems}
                            rankMatches
                            selectedId={voice.person_id || null}
                            inputText={voice.person_name || ""}
                            onSelect={(id, label) =>
                              updateVoice(i, v, { person_id: id, person_name: label })
                            }
                            onType={(text) => updateVoice(i, v, { person_name: text })}
                            onClear={() =>
                              updateVoice(i, v, { person_id: null, person_name: "" })
                            }
                            placeholder="Seiyuu name..."
                            allowNew
                          />
                        </div>
                        <input
                          className={cellCls + " shrink-0 w-28"}
                          placeholder="e.g. child"
                          value={voice.remark || ""}
                          onChange={(e) => updateVoice(i, v, { remark: e.target.value })}
                          aria-label="Voice remark"
                        />
                        {row.voices?.length > 0 && (
                          <button
                            type="button"
                            className="text-text-faint hover:text-danger px-1 pt-2 shrink-0"
                            aria-label="Remove seiyuu"
                            onClick={() => removeVoice(i, v)}
                          >
                            <i className="fas fa-minus text-[10px]" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      className="self-start text-[11px] text-brand hover:underline"
                      onClick={() => addVoice(i)}
                    >
                      + Another seiyuu
                    </button>
                  </div>
                ) : null}

                <input
                  className={cellCls + " flex-[1_1_12rem] min-w-0"}
                  placeholder="Remark"
                  value={row.remark || ""}
                  onChange={(e) => updateRow(i, { remark: e.target.value })}
                  aria-label="Remark"
                />
              </div>
            </div>

            <button
              type="button"
              className="text-danger/70 hover:text-danger px-1 pt-2 shrink-0"
              aria-label="Remove"
              onClick={() => removeRow(i)}
            >
              <i className="fas fa-times" />
            </button>
          </SortableItem>
          );
        })}
      </SortableList>
      <div className="flex flex-wrap items-center gap-3 mt-1">
        <button
          type="button"
          className="text-xs text-brand hover:underline"
          onClick={addRow}
        >
          + Add cast member
        </button>
        {malLink && (
          <button
            type="button"
            className="text-xs text-brand hover:underline disabled:opacity-50"
            onClick={importFromMal}
            disabled={malImporting}
          >
            {malImporting ? "Importing from MAL…" : "Import from MAL"}
          </button>
        )}
        {importSources.length > 0 && (
          <select
            className={cellCls + " text-xs py-1"}
            value=""
            aria-label="Import cast from"
            onChange={(e) => {
              const source = importSources.find((s) => s.entry_id === e.target.value);
              if (source) importCast(source);
            }}
          >
            <option value="">Import cast from…</option>
            {importSources.map((s) => (
              <option key={s.entry_id} value={s.entry_id}>
                {s.display_name} ({mediaTypeLabel(s.media_type)} · {s.cast_count})
              </option>
            ))}
          </select>
        )}
        {importMessage && (
          <span className="text-xs text-text-muted" role="status">
            {importMessage}
          </span>
        )}
      </div>
    </div>
  );
}
