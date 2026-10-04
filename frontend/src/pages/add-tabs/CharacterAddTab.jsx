// Frontend: add tab page file for CharacterAddTab.
//
// A character is the Person form minus the role machinery: a character
// holds no roles (see docs/superpowers/specs/
// 2026-09-05-seiyuu-character-design.md), so there is no role x scope matrix
// and no PersonSubTabBar - that component exists to split people by role,
// and a character has nothing to split by. Structurally this mirrors
// StudioAddTab.jsx more closely than PersonAddTab.jsx for that reason.
//
// CharacterFields is exported separately from the page wrapper so the
// Modify page's character editor renders the exact same inputs against an
// existing character's form state instead of duplicating them - the same
// arrangement StudioFields/PersonFields use.
import { Field, SectionHeader, inputCls, selectCls } from "../../components/forms/FormField";
import ImagePicker from "../../components/forms/ImagePicker";
import ExternalSearchBox from "../../components/forms/ExternalSearchBox";
import { endpoints } from "../../api/endpoints";
import {
  GenderRatingFields,
  PhotoFallbackField,
} from "../../components/forms/EntityProfileFields";
import { PERSON_NAME_FIELDS } from "../../lib/naming";
import { CHARACTER_ROLES } from "../../config/fieldOptions";

// A character carries the same four name columns and display_name_field
// choice as a person or studio - see naming.js's STUDIO_NAME_FIELDS comment.
export const CHARACTER_NAME_FIELDS = PERSON_NAME_FIELDS;

export { defaultCharacter } from "../../config/formFactories";

// `ownerId` is only passed by CharacterModifyTab, where the character row
// already exists - see ImagePicker's own module comment on why a brand-new
// (Add tab) row has nothing to attach to yet. When it is absent (the Add
// tab), the picked image cannot be attached until the character is saved, so
// its id is kept as `pending_image_id` for CharacterAddTab's caller to
// attach afterward.
export function CharacterFields({ characterForm, ucf, ownerId }) {
  const hasAnyName = CHARACTER_NAME_FIELDS.some(
    ({ field }) => characterForm[field]?.trim(),
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CHARACTER_NAME_FIELDS.map(({ key, label, field }) => (
          <Field key={key} label={`Name (${label})`}>
            <input
              className={inputCls}
              value={characterForm[field] ?? ""}
              onChange={(e) => ucf(field, e.target.value)}
            />
          </Field>
        ))}
      </div>
      {!hasAnyName && (
        <p className="text-[10px] font-bold text-danger -mt-2">
          A character needs at least one name.
        </p>
      )}
      <Field
        label="Display Name"
        hint="Which name to show by default. Falls back through English, Chinese, Japanese, Alternative when unset."
      >
        <select
          className={selectCls}
          value={characterForm.display_name_field ?? ""}
          onChange={(e) => ucf("display_name_field", e.target.value)}
        >
          <option value="">Default (English)</option>
          {CHARACTER_NAME_FIELDS.map(({ key, label }) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <SectionHeader icon="fa-id-card" title="Profile" />
      {/* The character's own role - independent of any casting's role, and
          never derived from or prefilled by one. */}
      <Field label="Role">
        <select
          aria-label="Role"
          className={selectCls}
          value={characterForm.role ?? ""}
          onChange={(e) => ucf("role", e.target.value)}
        >
          <option value="">—</option>
          {CHARACTER_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </Field>
      <GenderRatingFields form={characterForm} update={ucf} />
      <Field
        label="MAL Link"
        hint="The character's myanimelist.net/character/<id> page. On save, blank names and the photo are filled from it."
      >
        <input
          className={inputCls}
          value={characterForm.mal_link ?? ""}
          onChange={(e) => ucf("mal_link", e.target.value)}
          placeholder="https://myanimelist.net/character/..."
        />
      </Field>
      <Field label="Photo">
        <ImagePicker
          ownerType="character"
          ownerId={ownerId}
          role="cover"
          value={characterForm.photo_file}
          focus={characterForm.photo_focus}
          onFocusChange={(focus) => ucf("photo_focus", focus)}
          onChange={(key, imageId) => {
            ucf("photo_file", key);
            ucf("pending_image_id", ownerId ? null : imageId);
          }}
        />
      </Field>
      {ownerId && (
        <PhotoFallbackField
          ownerType="character"
          ownerId={ownerId}
          value={characterForm.photo_fallback_entry_id}
          onChange={(id) => ucf("photo_fallback_entry_id", id)}
        />
      )}
      <Field label="Remark">
        <textarea
          className={inputCls}
          rows={3}
          value={characterForm.remark ?? ""}
          onChange={(e) => ucf("remark", e.target.value)}
        />
      </Field>
    </div>
  );
}

export default function CharacterAddTab({ characterForm, ucf, applyMalPick }) {
  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6">
      {/* The tab's only search box: a character has no "copy an existing
          record" search. */}
      <ExternalSearchBox
        source="MAL"
        searchUrl={endpoints.character.searchMal}
        onPick={applyMalPick}
        placeholder="Search MAL — type a name to link this character..."
        hint="Links the MAL page. Names and portrait are filled from MAL on save."
      />
      <SectionHeader icon="fa-user-ninja" title="Character" />
      <CharacterFields characterForm={characterForm} ucf={ucf} />
    </div>
  );
}
