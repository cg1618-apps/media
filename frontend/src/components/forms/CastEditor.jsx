// Frontend: form component for an entry's cast (character + seiyuu list +
// role + position + photo + remark). Controlled, like NovelUnitsEditor: the parent
// owns `value` and receives every change through `onChange`. CastEditor
// never calls the API to save a cast list — only to search/create the
// characters and people its two comboboxes reference.
import { useEffect, useRef, useState } from "react";

import ComboBox from "./ComboBox";
import ImagePicker from "./ImagePicker";
import { DragHandle, SortableItem, SortableList, arrayMove } from "../ui/Sortable";
import { useConstants } from "../../config/useConstants";
import { endpoints } from "../../api/endpoints";
import { buildCreateRequest } from "../../lib/ensureSourceValues";
import { CHARACTER_ROLES, NEW_CAST_CHARACTER_GENDER } from "../../config/fieldOptions";
import { mediaTypeLabel } from "../../config/mediaRegistry";

// A synthetic ComboBox item id, distinguishable from every real
// character's UUID, that stands for "mint a brand new character with this
// typed name" rather than "select this existing character".
const CREATE_CHARACTER_PREFIX = "__create_character__:";

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

// The POST body for a character minted from this editor: the typed name,
// plus the gender NEW_CAST_CHARACTER_GENDER gives this media type, if any.
export function newCharacterBody(name, mediaType) {
  const gender = NEW_CAST_CHARACTER_GENDER[mediaType];
  return gender ? { name_en: name, gender } : { name_en: name };
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

function emptyRow(position) {
  return {
    system_id: undefined,
    character_id: null,
    character_name: "",
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
    const held = new Set(current.map((r) => r.character_id).filter(Boolean));
    const incoming = (cast || []).filter((r) => !held.has(r.character_id));
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
  const [malImporting, setMalImporting] = useState(false);
  async function importFromMal() {
    setMalImporting(true);
    setImportMessage("Fetching the cast from MyAnimeList…");
    try {
      const res = await fetch(endpoints.casting.fromMal(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ media_type: mediaType, mal_link: malLink }),
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
    });
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
    <div className="space-y-2">
      <SortableList ids={rowIds} onMove={move}>
        {rows.map((row, i) => (
          <SortableItem
            key={rowIds[i]}
            id={rowIds[i]}
            className="flex gap-1.5 items-start border border-border rounded-lg p-2 bg-surface"
          >
            <DragHandle
              label={row.character_name || `cast member ${i + 1}`}
              className="pt-2"
            />

            <div className="flex-1 min-w-0" aria-label="Character">
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
                  updateRow(i, { character_id: null, character_name: "" });
                  setCharacterResults((prev) => ({ ...prev, [i]: [] }));
                }}
                placeholder="Character name..."
              />
            </div>

            {showSeiyuu ? (
              <div className="flex-1 min-w-0 flex flex-col gap-1" aria-label="Seiyuu">
                {voiceLines(row).map((voice, v) => (
                  <div
                    // By index: a voice is never reordered, and keying on
                    // person_id would remount the box the moment one is picked.
                    key={v}
                    className="flex gap-1 items-start"
                    onBlur={(e) => resolveSeiyuu(i, v, e)}
                  >
                    <div className="flex-1 min-w-0">
                      <ComboBox
                        items={seiyuuList.map((p) => ({
                          id: p.system_id,
                          label: p.display_name,
                          searchText: p.display_name,
                        }))}
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
                      className={cellCls + " shrink-0 w-24"}
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

            <select
              className={cellCls + " shrink-0 w-28"}
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

            {/* No ownerType or ownerId: a casting cannot own an attachment,
                because replace_casting re-inserts every row on each save. The
                picked key rides in photo_file with the cast PUT, and the image
                library counts it as in use by reading that column. Its focal
                point rides beside it in photo_focus. */}
            <div role="group" aria-label="Photo" className="shrink-0 pt-0.5">
              <ImagePicker
                compact
                value={row.photo_file || ""}
                onChange={(key) => updateRow(i, { photo_file: key || null })}
                focus={row.photo_focus || null}
                onFocusChange={(focus) => updateRow(i, { photo_focus: focus })}
              />
            </div>

            <input
              className={cellCls + " flex-1 min-w-0"}
              placeholder="Remark"
              value={row.remark || ""}
              onChange={(e) => updateRow(i, { remark: e.target.value })}
              aria-label="Remark"
            />

            <button
              type="button"
              className="text-danger/70 hover:text-danger px-1 shrink-0"
              aria-label="Remove"
              onClick={() => removeRow(i)}
            >
              <i className="fas fa-times" />
            </button>
          </SortableItem>
        ))}
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
