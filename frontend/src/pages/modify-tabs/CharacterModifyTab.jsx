// Frontend: modify tab page file for CharacterModifyTab.
//
// Self-contained, like StudioModifyTab: owns its own fetch, picker and save
// state instead of hooking into Modify.jsx's per-type form/search/save
// machinery. Picked the way PersonModifyTab picks: a type tab (All, then each
// CHARACTER_ROLES value - a character holds at most one, unlike a person's
// role x scope matrix) and scope chips over the media types it is cast in,
// above a grid listing every match up front. Reuses CharacterFields from CharacterAddTab so the input
// markup isn't duplicated - see the comment on that export.
//
// `initialId` is a deep link's id (/modify?id=<system_id>&type=character, the
// detail page's Quick edit): that character's editor opens on mount.
//
// `sources` is Modify.jsx's fetchAllSources() bag, which the Appearance and
// Trait pickers suggest from; a save can create values in either vocabulary,
// so it calls `refreshSources` to make them selectable straight away.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import ScopeChips from "../../components/forms/ScopeChips";
import SubTabBar from "../../components/forms/SubTabBar";
import { CHARACTER_ROLES } from "../../config/fieldOptions";
import {
  ALL_TAB_KEY,
  characterRoleTabs,
  inAnyScope,
  inCharacterRole,
  scopeChoices,
  toggleIn,
} from "../../lib/entityScopes";
import { CharacterFields, CHARACTER_NAME_FIELDS } from "../add-tabs/CharacterAddTab";
import { Field, selectCls } from "../../components/forms/FormField";
import { endpoints } from "../../api/endpoints";
import { fetchJson, jsonBody } from "../../api/client";
import { useToast } from "../../hooks/useToast";
import { characterTagsPayload, characterTagsToForm } from "../../lib/characterForm";
import { releaseYear } from "../../lib/releaseDate";

function cleanString(str) {
  return (str || "").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

function characterToForm(c) {
  return {
    name_en: c.name_en || "",
    name_cn: c.name_cn || "",
    name_jp: c.name_jp || "",
    name_alt: c.name_alt || "",
    display_name_field: c.display_name_field || "",
    role: c.role || "",
    gender: c.gender || "",
    my_rating: c.my_rating || "",
    photo_file: c.photo_file || "",
    photo_focus: c.photo_focus || null,
    mal_link: c.mal_link || "",
    remark: c.remark || "",
    photo_fallback_entry_id: c.photo_fallback_entry_id || null,
    ...characterTagsToForm(c),
  };
}

export default function CharacterModifyTab({
  initialId = null,
  sources,
  refreshSources,
} = {}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [roleTab, setRoleTab] = useState(ALL_TAB_KEY);
  const [scopes, setScopes] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [characterForm, setCharacterForm] = useState(null);
  // The form as last loaded or saved: what "unsaved edits" is measured
  // against, so Sync from cast never overwrites them unseen.
  const [loadedForm, setLoadedForm] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: characters = [], isLoading } = useQuery({
    queryKey: ["characters-admin"],
    queryFn: () => fetchJson(endpoints.character.list()),
    staleTime: 10_000,
  });

  const ucf = (k, v) => setCharacterForm((p) => ({ ...p, [k]: v }));

  // The characters of the selected type, offered the scopes they hold.
  const ofRole = useMemo(
    () => characters.filter((c) => inCharacterRole(c, roleTab)),
    [characters, roleTab],
  );

  // Every match is listed up front, filtered in place by the search box
  // across all four name fields rather than just whichever one
  // display_name_field points at - an admin looking someone up by their
  // Japanese name must find them even when English is the display name.
  const filtered = useMemo(() => {
    const q = cleanString(search);
    const inScope = ofRole.filter((c) => inAnyScope(c, scopes));
    const matched = q
      ? inScope.filter((c) =>
          CHARACTER_NAME_FIELDS.some(
            ({ field }) => c[field] && cleanString(c[field]).includes(q),
          ),
        )
      : inScope;
    return [...matched].sort((a, b) =>
      (a.display_name || "").localeCompare(b.display_name || ""),
    );
  }, [ofRole, search, scopes]);

  function loadCharacter(systemId) {
    return fetchJson(endpoints.character.detail(systemId))
      .then((fresh) => {
        setSelectedId(fresh.system_id);
        showCharacter(fresh);
      })
      .catch(() => showToast("error", "Failed to load character."));
  }

  function showCharacter(character) {
    const form = characterToForm(character);
    setCharacterForm(form);
    setLoadedForm(form);
  }

  function selectCharacter(character) {
    loadCharacter(character.system_id);
  }

  useEffect(() => {
    if (initialId) loadCharacter(initialId);
    // Mount only: the deep link opens one editor, once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function closeEditor() {
    setSelectedId(null);
    setCharacterForm(null);
    setLoadedForm(null);
  }

  const dirty =
    !!characterForm && JSON.stringify(characterForm) !== JSON.stringify(loadedForm);

  const hasAnyName = characterForm
    ? CHARACTER_NAME_FIELDS.some(({ field }) => characterForm[field]?.trim())
    : false;

  async function handleSave(e) {
    e.preventDefault();
    if (submitting || !selectedId || !hasAnyName) return;
    setSubmitting(true);
    try {
      const updated = await fetchJson(
        endpoints.character.update(selectedId),
        {
          method: "PUT",
          ...jsonBody({
            name_en: characterForm.name_en.trim() || null,
            name_cn: characterForm.name_cn.trim() || null,
            name_jp: characterForm.name_jp.trim() || null,
            name_alt: characterForm.name_alt.trim() || null,
            display_name_field: characterForm.display_name_field || null,
            role: characterForm.role || null,
            gender: characterForm.gender || null,
            my_rating: characterForm.my_rating || null,
            photo_file: characterForm.photo_file || null,
            photo_focus: characterForm.photo_focus || null,
            mal_link: characterForm.mal_link?.trim() || null,
            remark: characterForm.remark || null,
            photo_fallback_entry_id: characterForm.photo_fallback_entry_id || null,
            ...characterTagsPayload(characterForm),
          }),
        },
      );
      await queryClient.invalidateQueries({ queryKey: ["characters-admin"] });
      showCharacter(updated);
      // Not awaited: the save already succeeded, and stale suggestions are
      // no reason to report it as failed.
      Promise.resolve(refreshSources?.()).catch(() => {});
      // Back to the top: the toast renders at the top of the page and
      // the form is long enough to have scrolled it out of sight.
      window.scrollTo(0, 0);
      showToast("success", "Character updated.");
    } catch (err) {
      showToast("error", err.message || "Update failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {!selectedId && (
        <>
          <SubTabBar
            tabs={characterRoleTabs(CHARACTER_ROLES)}
            active={roleTab}
            onSelect={(key) => {
              setRoleTab(key);
              setSearch("");
              setScopes([]);
            }}
          />
          <div className="bg-surface rounded-2xl border border-border shadow-sm p-4 space-y-3">
            <ScopeChips
              choices={scopeChoices(ofRole)}
              selected={scopes}
              onToggle={(scope) => setScopes((prev) => toggleIn(prev, scope))}
            />
            <div className="relative">
              <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-text-faint text-sm"></i>
              <input
                className="w-full border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
                placeholder="Search characters to modify..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {filtered.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {filtered.map((c) => (
                <button
                  key={c.system_id}
                  type="button"
                  onClick={() => selectCharacter(c)}
                  className="text-left px-3 py-2.5 bg-surface border border-border rounded-xl text-sm font-medium text-text-muted hover:border-brand hover:text-brand hover:bg-brand-soft transition shadow-sm truncate"
                >
                  {c.display_name}
                </button>
              ))}
            </div>
          )}

          {!isLoading && ofRole.length === 0 && (
            <p className="text-sm text-text-faint italic">
              {roleTab === ALL_TAB_KEY
                ? "No characters yet."
                : "No character has this type yet."}
            </p>
          )}
          {!isLoading && ofRole.length > 0 && filtered.length === 0 && (
            <p className="text-sm text-text-faint italic">
              {search
                ? "No character matches that name."
                : "No character is in the selected scopes."}
            </p>
          )}
        </>
      )}

      {selectedId && characterForm && (
        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={closeEditor}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm font-bold text-text-muted hover:bg-surface-2 transition shrink-0"
            >
              <i className="fas fa-arrow-left text-xs"></i> Back
            </button>
            <span className="font-mono text-xs text-text-faint bg-surface-2 px-2 py-1 rounded truncate">
              {selectedId}
            </span>
          </div>

          <div className="bg-surface rounded-2xl border border-border shadow-sm p-6">
            <CharacterFields
              characterForm={characterForm}
              ucf={ucf}
              ownerId={selectedId}
              sources={sources}
            />
          </div>

          <SyncFromCast
            characterId={selectedId}
            dirty={dirty}
            onSynced={async (updated) => {
              showCharacter(updated);
              await queryClient.invalidateQueries({ queryKey: ["characters-admin"] });
            }}
          />

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting || !hasAnyName}
              className="flex items-center gap-2 px-6 py-3 bg-brand text-on-brand rounded-xl font-black text-sm hover:bg-brand-hover transition disabled:opacity-60"
            >
              {submitting ? (
                <i className="fas fa-spinner fa-spin"></i>
              ) : (
                <i className="fas fa-save"></i>
              )}
              {submitting ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// A cast row's label: the entry, the identity it casts, if any, and the type.
function castRowLabel(entry) {
  const yr = releaseYear(entry.release_date);
  const as = entry.identity_name ? ` as ${entry.identity_name}` : "";
  return `${entry.display_name || "Untitled"}${yr ? ` (${yr})` : ""}${as} [${entry.media_type}]`;
}

/**
 * "Sync from cast": one of this character's cast rows replaces the role,
 * remark and photo of the record it casts - the character, or the identity
 * the row names (the server keeps the character's role then). A value the row
 * does not hold leaves the record's alone. It writes straight to the server,
 * so it is offered only while the form holds no unsaved edits, which the
 * reload would otherwise discard. The rows come from the /entries query the
 * Photo fallback picker shares.
 */
function SyncFromCast({ characterId, dirty, onSynced }) {
  const { showToast } = useToast();
  const [castingId, setCastingId] = useState("");
  const [syncing, setSyncing] = useState(false);
  const { data } = useQuery({
    queryKey: ["character-entries", characterId],
    queryFn: () => fetchJson(endpoints.character.entries(characterId)),
    enabled: !!characterId,
    staleTime: 10_000,
  });
  const castRows = (data?.groups || []).flatMap((group) =>
    (group.entries || [])
      .filter((entry) => entry.casting_id)
      .map((entry) => ({ ...entry, media_type: group.media_type })),
  );
  if (!castRows.length) return null;

  async function sync() {
    if (!castingId || dirty || syncing) return;
    setSyncing(true);
    try {
      const updated = await fetchJson(endpoints.character.syncFromCast(characterId), {
        method: "POST",
        ...jsonBody({ casting_id: castingId }),
      });
      await onSynced(updated);
      setCastingId("");
      showToast("success", "Synced from the cast row.");
    } catch (err) {
      showToast("error", err.message || "Sync from cast failed.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6">
      <Field
        label="Sync from cast"
        hint={
          dirty
            ? "Save or discard your edits first - syncing reloads the form."
            : "Replace the role, remark and photo with this cast row's (an identity's row updates that identity). What the row leaves blank is kept."
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-0">
            <select
              aria-label="Sync from cast"
              className={selectCls}
              value={castingId}
              onChange={(e) => setCastingId(e.target.value)}
              disabled={dirty || syncing}
            >
              <option value="">— Pick a cast row —</option>
              {castRows.map((entry) => (
                <option key={entry.casting_id} value={entry.casting_id}>
                  {castRowLabel(entry)}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={sync}
            disabled={!castingId || dirty || syncing}
            className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-sm font-bold text-text-muted hover:bg-surface-2 transition shrink-0 disabled:opacity-50"
          >
            {syncing ? (
              <i className="fas fa-spinner fa-spin text-xs"></i>
            ) : (
              <i className="fas fa-sync text-xs"></i>
            )}
            {syncing ? "Syncing..." : "Sync"}
          </button>
        </div>
      </Field>
    </div>
  );
}
