// Frontend: modify tab page file for IdentityModifyTab.
//
// Self-contained, like CharacterModifyTab: it owns its fetch, picker and save
// state. IdentityPicker (search box + grid of every identity) is exported for
// IdentityDeleteTab, which picks the same way. The character an identity
// belongs to is shown read-only: it is fixed once saved.
//
// `initialId` is a deep link's id (/modify?id=<system_id>&type=identity): that
// identity's editor opens on mount.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { endpoints } from "../../api/endpoints";
import { fetchJson, jsonBody } from "../../api/client";
import { useToast } from "../../hooks/useToast";
import { SectionHeader, inputCls } from "../../components/forms/FormField";
import { IdentityFields, defaultIdentity, hasAnyIdentityName, identityPayload } from "../add-tabs/IdentityAddTab";

export const IDENTITIES_QUERY_KEY = ["identities-admin"];

function cleanString(str) {
  return (str || "").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

export function useIdentities() {
  return useQuery({
    queryKey: IDENTITIES_QUERY_KEY,
    queryFn: () => fetchJson(endpoints.characterIdentity.list()),
    staleTime: 10_000,
  });
}

function identityToForm(i) {
  return {
    ...defaultIdentity(),
    name_en: i.name_en || "",
    name_cn: i.name_cn || "",
    name_jp: i.name_jp || "",
    name_alt: i.name_alt || "",
    display_name_field: i.display_name_field || "",
    gender: i.gender || "",
    remark: i.remark || "",
    photo_file: i.photo_file || "",
    photo_focus: i.photo_focus || null,
  };
}

// A search box over every identity, filtered client-side on the four names and
// the character's name, and a grid of buttons to pick one.
export function IdentityPicker({ identities, isLoading, onPick, placeholder }) {
  const [search, setSearch] = useState("");
  const matches = useMemo(() => {
    const q = cleanString(search);
    if (!q) return identities;
    return identities.filter((i) =>
      [i.name_en, i.name_cn, i.name_jp, i.name_alt, i.character_display_name].some((v) =>
        cleanString(v).includes(q),
      ),
    );
  }, [identities, search]);

  return (
    <div className="space-y-3">
      <input
        type="text"
        className={inputCls}
        placeholder={placeholder}
        aria-label="Search identities"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {isLoading ? (
        <p className="text-sm text-text-muted">Loading...</p>
      ) : identities.length === 0 ? (
        <p className="text-sm text-text-muted">No identities yet.</p>
      ) : matches.length === 0 ? (
        <p className="text-sm text-text-muted">No identity matches that name.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {matches.map((i) => (
            <button
              key={i.system_id}
              type="button"
              onClick={() => onPick(i)}
              className="text-left px-3 py-2 rounded-lg border border-border bg-surface hover:bg-surface-2 text-sm font-bold text-text transition"
            >
              {i.display_name} — {i.character_display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function IdentityModifyTab({ initialId = null } = {}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data: identities = [], isLoading } = useIdentities();

  const [pickedId, setPickedId] = useState(initialId);
  const [form, setForm] = useState(null);
  const [formFor, setFormFor] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const selected = identities.find((i) => i.system_id === pickedId) || null;
  // Load the form once per picked identity, when its row is available.
  if (selected && formFor !== selected.system_id) {
    setFormFor(selected.system_id);
    setForm(identityToForm(selected));
  }
  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  async function save(e) {
    e.preventDefault();
    if (!selected || !hasAnyIdentityName(form) || submitting) return;
    setSubmitting(true);
    try {
      await fetchJson(endpoints.characterIdentity.update(selected.system_id), {
        method: "PUT",
        ...jsonBody(identityPayload(form)),
      });
      await queryClient.invalidateQueries({ queryKey: IDENTITIES_QUERY_KEY });
      showToast("success", "Identity saved.");
    } catch (err) {
      showToast("error", err.message || "Failed to save identity.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6 space-y-4">
      <SectionHeader icon="fa-masks-theater" title="Modify Identity" />
      {!selected ? (
        <IdentityPicker
          identities={identities}
          isLoading={isLoading}
          onPick={(i) => setPickedId(i.system_id)}
          placeholder="Search identities to modify..."
        />
      ) : (
        form && (
          <form onSubmit={save} className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-text-muted">
                Identity of <span className="font-black text-text">{selected.character_display_name}</span>
              </p>
              <button
                type="button"
                onClick={() => {
                  setPickedId(null);
                  setFormFor(null);
                  setForm(null);
                }}
                className="text-xs font-bold text-text-muted hover:text-text"
              >
                Pick another
              </button>
            </div>
            <IdentityFields form={form} update={update} ownerId={selected.system_id} />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!hasAnyIdentityName(form) || submitting}
                className="flex items-center gap-2 px-6 py-3 bg-brand text-on-brand rounded-xl font-black text-sm hover:bg-brand-hover transition disabled:opacity-60"
              >
                <i className={`fas ${submitting ? "fa-spinner fa-spin" : "fa-save"}`}></i>
                Save Identity
              </button>
            </div>
          </form>
        )
      )}
    </div>
  );
}
