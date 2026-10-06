// Frontend: add tab for a character's other identity.
//
// An identity is always created under an EXISTING character - there is no
// free-standing identity - so the tab opens with a required character
// picker, and the form below it is the identity's own fields: names, gender
// (empty = the character's), photo, remark. Self-contained like
// CharacterModifyTab: it owns its fetches, so Add.jsx only renders it.
//
// IdentityFields is exported for IdentityModifyTab, which edits the same
// inputs against an existing identity.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Field, SectionHeader, inputCls, selectCls } from "../../components/forms/FormField";
import ComboBox from "../../components/forms/ComboBox";
import ImagePicker, { attachUploadedImage } from "../../components/forms/ImagePicker";
import { GENDERS } from "../../config/fieldOptions";
import { endpoints } from "../../api/endpoints";
import { fetchJson, jsonBody } from "../../api/client";
import { useToast } from "../../hooks/useToast";
import { PERSON_NAME_FIELDS } from "../../lib/naming";

export const IDENTITY_NAME_FIELDS = PERSON_NAME_FIELDS;

// The admin identities list (Modify, Delete) is cached under this key; it
// lives here, not beside the hook, so Add can invalidate it without a cycle.
export const IDENTITIES_QUERY_KEY = ["identities-admin"];

export function defaultIdentity() {
  return {
    name_en: "", name_cn: "", name_jp: "", name_alt: "",
    display_name_field: "", gender: "", remark: "",
    photo_file: "", photo_focus: null, pending_image_id: null,
  };
}

export function identityPayload(form) {
  return {
    name_en: form.name_en.trim() || null,
    name_cn: form.name_cn.trim() || null,
    name_jp: form.name_jp.trim() || null,
    name_alt: form.name_alt.trim() || null,
    display_name_field: form.display_name_field || null,
    gender: form.gender || null,
    remark: form.remark || null,
    photo_file: form.photo_file || null,
    photo_focus: form.photo_focus || null,
  };
}

export function hasAnyIdentityName(form) {
  return IDENTITY_NAME_FIELDS.some(({ field }) => form[field]?.trim());
}

// `characterGender` is what an empty gender means - the character's own -
// shown in the empty option so the admin sees what they are inheriting.
export function IdentityFields({ form, update, ownerId, characterGender }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {IDENTITY_NAME_FIELDS.map(({ key, label, field }) => (
          <Field key={key} label={`Name (${label})`}>
            <input
              aria-label={`Name (${label})`}
              className={inputCls}
              value={form[field] ?? ""}
              onChange={(e) => update(field, e.target.value)}
            />
          </Field>
        ))}
      </div>
      {!hasAnyIdentityName(form) && (
        <p className="text-[10px] font-bold text-danger -mt-2">An identity needs at least one name.</p>
      )}
      <Field label="Display Name" hint="Which name to show. Falls back through English, Chinese, Japanese, Alternative when unset.">
        <select className={selectCls} value={form.display_name_field ?? ""} onChange={(e) => update("display_name_field", e.target.value)}>
          <option value="">Default (English)</option>
          {IDENTITY_NAME_FIELDS.map(({ key, label }) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </Field>
      <Field label="Gender" hint="Empty means the same as the character.">
        <select aria-label="Gender" className={selectCls} value={form.gender ?? ""} onChange={(e) => update("gender", e.target.value)}>
          <option value="">Same as character{characterGender ? ` (${characterGender})` : ""}</option>
          {GENDERS.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </Field>
      <Field label="Photo">
        <ImagePicker
          ownerType="character-identity"
          ownerId={ownerId}
          role="cover"
          value={form.photo_file}
          focus={form.photo_focus}
          onFocusChange={(focus) => update("photo_focus", focus)}
          onChange={(key, imageId) => {
            update("photo_file", key);
            update("pending_image_id", ownerId ? null : imageId);
          }}
        />
      </Field>
      <Field label="Remark">
        <textarea className={inputCls} rows={3} value={form.remark ?? ""} onChange={(e) => update("remark", e.target.value)} />
      </Field>
    </div>
  );
}

// The required character: searched by name as the cast editor does, never
// created here - a new character is made on the Character tab.
export function CharacterPicker({ value, onChange }) {
  const [results, setResults] = useState([]);
  const [text, setText] = useState(value?.display_name || "");
  async function search(q) {
    setText(q);
    if (!q.trim()) return setResults([]);
    const qs = new URLSearchParams({ name: q.trim() }).toString();
    try {
      setResults(await fetchJson(endpoints.character.list(qs)));
    } catch {
      setResults([]);
    }
  }
  return (
    <Field label="Character" hint="The character this is an identity of. Required, and fixed once saved.">
      <div>
        <ComboBox
          ariaLabel="Character"
          clearLabel="Clear character"
          items={results.map((c) => ({ id: c.system_id, label: c.display_name, searchText: text }))}
          selectedId={value?.system_id || null}
          inputText={text}
          onType={search}
          onSelect={(id) => {
            const picked = results.find((c) => c.system_id === id);
            onChange(picked || null);
            setText(picked?.display_name || "");
          }}
          onClear={() => {
            onChange(null);
            setText("");
          }}
          placeholder="Search characters..."
        />
      </div>
    </Field>
  );
}

export default function IdentityAddTab() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [character, setCharacter] = useState(null);
  const [form, setForm] = useState(defaultIdentity());
  const [submitting, setSubmitting] = useState(false);
  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const ready = !!character && hasAnyIdentityName(form);

  async function submit() {
    if (!ready || submitting) return;
    setSubmitting(true);
    try {
      const created = await fetchJson(endpoints.characterIdentity.create(), {
        method: "POST",
        ...jsonBody({ character_id: character.system_id, ...identityPayload(form) }),
      });
      if (form.pending_image_id) {
        try {
          await attachUploadedImage(form.pending_image_id, "character-identity", created.system_id, "cover");
        } catch (err) {
          showToast("error", err.message || "Identity saved, but attaching the image failed.");
        }
      }
      // Modify and Delete read this list: a just-added identity shows at once.
      queryClient.invalidateQueries({ queryKey: IDENTITIES_QUERY_KEY });
      showToast("success", `Identity added to ${character.display_name}.`);
      setForm(defaultIdentity());
    } catch (err) {
      showToast("error", err.message || "Failed to create identity.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="bg-surface rounded-2xl border border-border shadow-sm p-6 space-y-4"
      onKeyDown={(e) => {
        // Enter in a text input submits. Add.jsx's page-wide form would
        // otherwise swallow it; the ComboBox's Enter-to-select has already
        // called preventDefault, so picking a character does not submit.
        if (e.key !== "Enter" || e.defaultPrevented || e.target.tagName !== "INPUT") return;
        e.preventDefault();
        submit();
      }}
    >
      <SectionHeader icon="fa-masks-theater" title="Identity" />
      <CharacterPicker value={character} onChange={setCharacter} />
      <IdentityFields form={form} update={update} characterGender={character?.gender} />
      <div className="flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={!ready || submitting}
          className="flex items-center gap-2 px-6 py-3 bg-brand text-on-brand rounded-xl font-black text-sm hover:bg-brand-hover transition disabled:opacity-60"
        >
          <i className={`fas ${submitting ? "fa-spinner fa-spin" : "fa-plus"}`}></i>
          Add Identity
        </button>
      </div>
    </div>
  );
}
