// Frontend: add tab page file for PersonAddTab.
//
// People used to be a sub-tab of System Options, sharing that nav entry with
// Options and Tags (see OptionSubTabBar.jsx's history). A person is a credited
// entity with its own public pages, not a closed vocabulary, so it moved into
// the Entity tab group beside Studio - see config/adminTabs.js.
//
// PersonFields is exported separately from the page wrapper so the Modify
// page's person editor renders the exact same inputs against an existing
// person's form state instead of duplicating them - the same arrangement
// StudioAddTab uses for StudioFields.
import MyRatingFields from "../../components/forms/MyRatingFields";
import { useQuery } from "@tanstack/react-query";

import { Field, SectionHeader, inputCls, selectCls } from "../../components/forms/FormField";
import { PERSON_SUB_TABS } from "../../components/forms/PersonSubTabBar";
import ImagePicker from "../../components/forms/ImagePicker";
import ExternalSearchBox from "../../components/forms/ExternalSearchBox";
import WorkImagesEditor from "../../components/forms/WorkImagesEditor";
import StudioAffiliationField from "../../components/forms/StudioAffiliationField";
import {
  ContentRatingField,
  GenderField,
  PhotoFallbackField,
} from "../../components/forms/EntityProfileFields";
import { endpoints } from "../../api/endpoints";
import { fetchJson } from "../../api/client";
import { PERSON_NAME_FIELDS, isSeiyuu } from "../../lib/naming";
import { holdsGalleryRole } from "../../lib/workImages";

export { defaultPerson } from "../../config/formFactories";

// The person's own pages: stored as typed, with no id read from them.
export const PERSON_SOCIAL_LINKS = [
  { field: "twitter_link", label: "Twitter Link", placeholder: "https://x.com/..." },
  { field: "ig_link", label: "Instagram Link", placeholder: "https://www.instagram.com/..." },
  { field: "pixiv_link", label: "pixiv Link", placeholder: "https://www.pixiv.net/users/..." },
];

/**
 * Which media types each person role may be scoped to, from
 * GET /api/person/role-scopes.
 *
 * Fetched rather than hard-coded: the legal pairs are derived on the backend
 * from the same CreditRole.media_types that PersonRoleIn validates writes
 * against, so a form built from this cannot offer a scope the API will reject.
 * A hand-written copy here is exactly the drift OptionsAddTab.jsx documents in
 * its own header comment about the person-role list.
 */
export function useRoleScopes() {
  const { data } = useQuery({
    queryKey: ["person-role-scopes"],
    queryFn: () => fetchJson(endpoints.person.roleScopes()),
    staleTime: 5 * 60 * 1000,
  });
  return data || {};
}

/**
 * The role × scope matrix.
 *
 * Ticking a type holds the role with no media type ticked: a {role, scope:
 * null} row, which lists the person under the type and offers them in no
 * dropdown. Ticking a media type turns that row into scoped ones, and
 * unticking the last one turns it back. There is still no "offered
 * everywhere" state - see the design spec's Decision B.
 *
 * Two exceptions. A type the server does not offer (absent from
 * `legalScopes`) is not drawn: that is `club` for a session that cannot see
 * h-comic, and a row whose checkbox could never tick would only say the type
 * exists. And a type that exists only for a gated type (`gatedType`, the
 * club) must keep that scope, since an unscoped club would hide from nobody,
 * so ticking it selects its scope and the scope cannot be unticked.
 */
export function PersonRoleMatrix({ roles, setRoles, legalScopes }) {
  const held = new Set((roles || []).map((r) => r.role));

  function scopesFor(role) {
    return (roles || [])
      .filter((r) => r.role === role && r.scope)
      .map((r) => r.scope);
  }

  function setRoleScopes(role, scopes) {
    setRoles([
      ...(roles || []).filter((r) => r.role !== role),
      ...(scopes.length
        ? scopes.map((scope) => ({ role, scope }))
        : [{ role, scope: null }]),
    ]);
  }

  function dropRole(role) {
    setRoles((roles || []).filter((r) => r.role !== role));
  }

  function toggleScope(role, scope) {
    const current = scopesFor(role);
    const next = current.includes(scope)
      ? current.filter((s) => s !== scope)
      : (legalScopes[role] || []).filter(
          (s) => current.includes(s) || s === scope,
        );
    setRoleScopes(role, next);
  }

  const types = PERSON_SUB_TABS.filter((t) => legalScopes[t.key]);

  return (
    <div className="space-y-2">
      <label className="block text-[10px] font-bold text-text-faint">
        Types and Scopes
      </label>
      <p className="text-[11px] text-text-faint">
        Which types this person is, and which dropdowns offer them. A type with
        no media type ticked is listed under the type and offered in no
        dropdown.
      </p>
      {types.map((t) => {
        const legal = legalScopes[t.key];
        const selected = scopesFor(t.key);
        const required = Boolean(t.gatedType);
        return (
          <div key={t.key} className="rounded-xl border border-border p-3">
            <label className="flex items-center gap-2 text-sm font-bold text-text">
              <input
                type="checkbox"
                checked={held.has(t.key)}
                onChange={(e) => {
                  if (!e.target.checked) dropRole(t.key);
                  else setRoleScopes(t.key, required ? legal.slice(0, 1) : []);
                }}
              />
              <i className={`fas ${t.icon} text-text-faint`}></i>
              {t.label}
            </label>
            {held.has(t.key) && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {legal.map((scope) => {
                  const on = selected.includes(scope);
                  const locked = required && on && selected.length === 1;
                  return (
                    <button
                      key={scope}
                      type="button"
                      aria-pressed={on}
                      disabled={locked}
                      onClick={() => toggleScope(t.key, scope)}
                      className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${
                        on
                          ? "bg-brand text-on-brand border-brand"
                          : "bg-surface text-text-faint border-border hover:border-border-strong"
                      }`}
                    >
                      {scope}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// `ownerId` is only passed by PersonModifyTab, where the person row already
// exists - see ImagePicker's own module comment on why a brand-new (Add tab)
// row has nothing to attach to yet. When it is absent (the Add tab), the
// picked image cannot be attached until the person is saved, so its id is
// kept as `pending_image_id` for PersonAddTab's caller to attach afterward.
export function PersonFields({ personForm, upf, roles, setRoles, legalScopes, ownerId }) {
  // A seiyuu's unset display name falls back CN-first (Person.display_name).
  const seiyuu = isSeiyuu({ roles });
  const hasAnyName = PERSON_NAME_FIELDS.some(
    ({ field }) => personForm[field]?.trim(),
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PERSON_NAME_FIELDS.map(({ key, label, field }) => (
          <Field key={key} label={`Name (${label})`}>
            <input
              className={inputCls}
              value={personForm[field] ?? ""}
              onChange={(e) => upf(field, e.target.value)}
            />
          </Field>
        ))}
      </div>
      {!hasAnyName && (
        <p className="text-[10px] font-bold text-danger -mt-2">
          A person needs at least one name.
        </p>
      )}
      <Field
        label="Display Name"
        hint={
          seiyuu
            ? "Which name to show by default. A seiyuu falls back through Chinese, Japanese, English, Alternative when unset."
            : "Which name to show by default. Falls back through English, Chinese, Japanese, Alternative when unset."
        }
      >
        <select
          className={selectCls}
          value={personForm.display_name_field ?? ""}
          onChange={(e) => upf("display_name_field", e.target.value)}
        >
          <option value="">{seiyuu ? "Default (Chinese)" : "Default (English)"}</option>
          {PERSON_NAME_FIELDS.map(({ key, label }) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <PersonRoleMatrix
        roles={roles}
        setRoles={setRoles}
        legalScopes={legalScopes}
      />

      <SectionHeader icon="fa-id-card" title="Profile" />
      <GenderField kind="person" form={personForm} update={upf} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ContentRatingField form={personForm} update={upf} />
      </div>
      <Field
        label="Affiliation"
        hint="The studios this person belongs to - a seiyuu's agency, a director's studio. Saved with the person."
      >
        <StudioAffiliationField
          value={personForm.affiliations}
          onChange={(next) => upf("affiliations", next)}
        />
      </Field>
      <Field
        label="MAL Link"
        hint="The person's myanimelist.net/people/<id> page; the MAL id is read from it."
      >
        <input
          className={inputCls}
          value={personForm.mal_link ?? ""}
          onChange={(e) => upf("mal_link", e.target.value)}
          placeholder="https://myanimelist.net/people/..."
        />
      </Field>
      <Field
        label="AniList Link"
        hint="The person's anilist.co/staff/<id> page. Stored as given; nothing is filled from it."
      >
        <input
          className={inputCls}
          value={personForm.anilist_link ?? ""}
          onChange={(e) => upf("anilist_link", e.target.value)}
          placeholder="https://anilist.co/staff/..."
        />
      </Field>
      <Field
        label="IMDb Link"
        hint="The person's imdb.com/name/nm<id> page; the IMDb id is read from it, and TMDB fills what MAL leaves blank."
      >
        <input
          className={inputCls}
          value={personForm.imdb_link ?? ""}
          onChange={(e) => upf("imdb_link", e.target.value)}
          placeholder="https://www.imdb.com/name/..."
        />
      </Field>
      {PERSON_SOCIAL_LINKS.map(({ field, label, placeholder }) => (
        <Field key={field} label={label}>
          <input
            className={inputCls}
            value={personForm[field] ?? ""}
            onChange={(e) => upf(field, e.target.value)}
            placeholder={placeholder}
          />
        </Field>
      ))}
      <Field label="Photo">
        <ImagePicker
          ownerType="staff"
          ownerId={ownerId}
          role="cover"
          value={personForm.photo_file}
          focus={personForm.photo_focus}
          onFocusChange={(focus) => upf("photo_focus", focus)}
          onChange={(key, imageId) => {
            upf("photo_file", key);
            upf("pending_image_id", ownerId ? null : imageId);
          }}
        />
      </Field>
      {ownerId && (
        <PhotoFallbackField
          ownerType="person"
          ownerId={ownerId}
          value={personForm.photo_fallback_entry_id}
          onChange={(id) => upf("photo_fallback_entry_id", id)}
        />
      )}
      {/* An author's or illustrator's gallery of works, shown on their page.
          Saved as it is edited, like the photo, so only an existing person
          has one. */}
      {ownerId && holdsGalleryRole(roles) && (
        <Field
          label="Works"
          hint="Pictures of their work, in the order their page shows them. Each saves at once."
        >
          <WorkImagesEditor personId={ownerId} />
        </Field>
      )}
      {/* The viewer's own rating, saved through /api/me/ratings by the
          page once the person itself has saved. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MyRatingFields kind="person" form={personForm} update={upf} />
      </div>
    </div>
  );
}

export default function PersonAddTab({
  personForm,
  upf,
  roles,
  setRoles,
  applyMalPick,
}) {
  const legalScopes = useRoleScopes();

  return (
    <>
      {/* The tab's only search box: a person has no "copy an existing
          record" search. The server fills on save from MAL, then TMDB,
          for whichever link the person has, as the two Person Fills do. */}
      <ExternalSearchBox
        source="MAL"
        searchUrl={endpoints.person.searchMal}
        onPick={applyMalPick}
        placeholder="Search MAL — type a name to link this person..."
        hint="Links the MAL page. Names and photo are filled from MAL on save."
      />
      <PersonFields
        personForm={personForm}
        upf={upf}
        roles={roles}
        setRoles={setRoles}
        legalScopes={legalScopes}
      />
    </>
  );
}
