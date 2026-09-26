// Frontend: add tab page file for HComicAddTab.
//
// The form of the gated h-comic type, shared by the Add and Modify tabs the
// way GameAddTab's is: this file exports the field body and the lineage
// pickers, and HComicModifyTab renders them, so the two cannot drift.
//
// Region comes first. Which fields the rest of the form shows depends on it
// (lib/hComicRegion.js) - pages and the JP catalogue fields on JP, chapters,
// an author and an official source on KR - so until a region is chosen only
// the fields both regions share are offered.
import CastEditor from "../../components/forms/CastEditor";
import FamilyLineageFields from "../../components/forms/FamilyLineageFields";
import {
  Field,
  SectionHeader,
  inputCls,
  selectCls,
} from "../../components/forms/FormField";
import ImagePicker from "../../components/forms/ImagePicker";
import MultiSelect from "../../components/forms/MultiSelect";
import ReleaseDateInput from "../../components/forms/ReleaseDateInput";
import SourcesEditor from "../../components/forms/SourcesEditor";
import StatusOptions from "../../components/ui/StatusOptions";
import {
  H_COMIC_ANIMATION_STATUSES,
  H_COMIC_ORIGINALITY,
  H_COMIC_REGIONS,
  H_COMIC_USEFULNESS,
  MANGA_SERIALIZATION_STATUSES,
  MY_RATINGS,
  READING_STATUSES,
} from "../../config/fieldOptions";
import { isDerivedAnimationStatus } from "../../lib/hComicAnimation";
import { showsField } from "../../lib/hComicRegion";
import {
  followRegion,
  suggestedRestrictedSources,
} from "../../lib/hComicRestrictedSources";
import { getSourceValues } from "../../utils/media";

export { defaultHComic } from "../../config/formFactories";

// The franchise type a new h-comic franchise is created with. The picker
// offers the whole h-comic family (FamilyLineageFields).
export const H_COMIC_FRANCHISE_TYPE = "H-Comic";

function Options({ values }) {
  return (
    <>
      <option value="">—</option>
      {values.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </>
  );
}

/** The region select. Rendered first by both tabs. */
export function HComicRegionField({ f, u }) {
  return (
    <Field
      label="Region"
      required
      hint="JP counts pages, KR counts chapters - the rest of the form follows"
    >
      <select
        className={selectCls}
        aria-label="Region"
        value={f.region}
        onChange={(e) => u("region", e.target.value)}
      >
        <option value="">Choose a region…</option>
        {H_COMIC_REGIONS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    </Field>
  );
}

/**
 * Every field below the region and the lineage pickers, shared verbatim by
 * the Modify tab. `ownerId` is passed by the Modify tab only, where the row
 * exists; without it a picked cover waits in `pending_image_id` for the Add
 * page to attach once the entry is saved.
 */
export function HComicFormBody({ f, u, sources, ownerId }) {
  const shows = (field) => showsField(f.region, field);

  const tagField = (key, source, placeholder) => (
    <MultiSelect
      options={getSourceValues(sources, source)}
      value={f[key]}
      onChange={(v) => u(key, v)}
      placeholder={placeholder}
    />
  );
  const num = (key, label, hint) => (
    <Field label={label} hint={hint}>
      <input
        className={inputCls}
        type="number"
        aria-label={label}
        value={f[key] ?? ""}
        onChange={(e) => u(key, e.target.value)}
        placeholder="0"
      />
    </Field>
  );
  const text = (key, label, placeholder) => (
    <Field label={label}>
      <input
        className={inputCls}
        aria-label={label}
        value={f[key] ?? ""}
        onChange={(e) => u(key, e.target.value)}
        placeholder={placeholder}
      />
    </Field>
  );
  const select = (key, label, values) => (
    <Field label={label}>
      <select
        className={selectCls}
        aria-label={label}
        value={f[key] ?? ""}
        onChange={(e) => u(key, e.target.value)}
      >
        <Options values={values} />
      </select>
    </Field>
  );

  return (
    <>
      {text("h_comic_name_cn", "H-Comic Name CN", "Chinese title")}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {text("h_comic_name_en", "H-Comic Name EN", "English title")}
        {text("h_comic_name_alt", "H-Comic Name Alt", "Alternative title")}
      </div>
      {/* The region's own name only. The other one is kept if it was ever
          filled in, but not shown. */}
      {shows("h_comic_name_jp") && text("h_comic_name_jp", "H-Comic Name JP", "Japanese title")}
      {shows("h_comic_name_kr") && text("h_comic_name_kr", "H-Comic Name KR", "Korean title")}

      <SectionHeader icon="fa-sitemap" title="Classification" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {select("serialization_status", "Serialization Status", MANGA_SERIALIZATION_STATUSES)}
        {shows("originality") && select("originality", "Originality", H_COMIC_ORIGINALITY)}
        {shows("animation_status") &&
          (isDerivedAnimationStatus(f) ? (
            // Derived while a hentai adapts this h-comic: the server refuses
            // any other value, and the payload leaves it out
            // (hComicFieldsPayload), so it is shown, not offered.
            <Field
              label="Animation Status"
              hint="Derived from a linked hentai adaptation - remove the relation to set it by hand"
            >
              <input
                className={inputCls}
                aria-label="Animation Status"
                value={f.animation_status || ""}
                readOnly
                disabled
              />
            </Field>
          ) : (
            select("animation_status", "Animation Status", H_COMIC_ANIMATION_STATUSES)
          ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Genre Plot">
          {tagField(
            "h_genre_plot",
            { kind: "option", category: "H Genre Plot", scope: "h-comic" },
            "Select or type genre..."
          )}
        </Field>
        <Field label="Genre Appearance">
          {tagField(
            "h_genre_appearance",
            { kind: "option", category: "H Genre Appearance", scope: "h-comic" },
            "Select or type genre..."
          )}
        </Field>
        <Field label="Genre Relation">
          {tagField(
            "h_genre_relation",
            { kind: "option", category: "H Genre Relation", scope: "h-comic" },
            "Select or type genre..."
          )}
        </Field>
      </div>

      <SectionHeader icon="fa-pen-nib" title="Credits" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Club" hint="A person holding the Club role, quick-created if new">
          {tagField(
            "club",
            { kind: "person", role: "club", scope: "h-comic" },
            "Select or type club..."
          )}
        </Field>
        <Field label="繪師" hint="The artists">
          {tagField(
            "illustrator",
            { kind: "person", role: "illustrator", scope: "h-comic" },
            "Select or type artist..."
          )}
        </Field>
      </div>
      {shows("author") && (
        <Field label="Author">
          {tagField(
            "author",
            { kind: "person", role: "author", scope: "h-comic" },
            "Select or type author..."
          )}
        </Field>
      )}

      <SectionHeader icon="fa-chart-bar" title="Status & Progress" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Reading Status">
          <select
            className={selectCls}
            aria-label="Reading Status"
            value={f.reading_status}
            onChange={(e) => u("reading_status", e.target.value)}
          >
            <StatusOptions statuses={READING_STATUSES} />
          </select>
        </Field>
        {select("my_rating", "My Rating", MY_RATINGS)}
        {select("usefulness", "Usefulness", H_COMIC_USEFULNESS)}
      </div>
      {f.region && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {shows("page_total") && num("page_total", "Page Total")}
          {shows("page_fin") && num("page_fin", "Pages Read")}
          {shows("series_number") &&
            num("series_number", "Series Number", "Its place in its series")}
          {shows("ch_total") && num("ch_total", "Chapter Total")}
          {shows("ch_fin") && num("ch_fin", "Chapters Read")}
          {shows("ch_behind") && num("ch_behind", "Chapters Behind Official", "Set by hand")}
        </div>
      )}

      <SectionHeader icon="fa-calendar" title="Release" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ReleaseDateInput
          label="Release Date"
          value={f.release_date}
          onChange={(v) => u("release_date", v)}
        />
        <ReleaseDateInput label="End Date" value={f.end_date} onChange={(v) => u("end_date", v)} />
      </div>

      {/* The MAL id is not typed in: the write hook derives it from the
          link, and Tenrai fills the serialization status, the dates, the
          cover and a finished KR entry's chapter total from it where they
          are blank. */}
      <SectionHeader icon="fa-external-link-alt" title="Links" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <Field label="MAL Link">
            <input
              className={inputCls}
              type="url"
              aria-label="MAL Link"
              value={f.mal_link ?? ""}
              onChange={(e) => u("mal_link", e.target.value)}
              placeholder="https://myanimelist.net/manga/..."
            />
          </Field>
        </div>
        <Field label="MAL ID" hint="Derived from the link on save">
          <input
            className={inputCls}
            aria-label="MAL ID"
            value={f.mal_link ? (f.mal_id ?? "") : ""}
            readOnly
            disabled
          />
        </Field>
      </div>

      {/* Characters are real character rows, cast without a seiyuu - the
          cast is saved through PUT /api/casting/h-comic/{id} once the entry
          exists, never as part of the entry payload. */}
      <SectionHeader icon="fa-users" title="Cast" />
      <CastEditor mediaType="h-comic" value={f.cast} onChange={(v) => u("cast", v)} />

      <SectionHeader icon="fa-broadcast-tower" title="Sources" />
      {shows("original_source") && (
        <Field label="Official Source" hint="Where the work is officially serialised">
          {tagField(
            "original_source",
            { kind: "option", category: "Platform", scope: "h-comic", usage: "origin" },
            "Select or type platform..."
          )}
        </Field>
      )}
      <SourcesEditor
        value={f.sources}
        onChange={(rows) => u("sources", rows)}
        mediaType="h-comic"
        sources={sources}
        restrictedSuggestions={suggestedRestrictedSources(f.region)}
      />

      <SectionHeader icon="fa-flag" title="Flags" />
      <div className="flex flex-wrap gap-6 mt-2">
        {[
          ["read_next", "Read Next", "Add to Read Next list"],
          ["to_reread", "To Reread", "Mark for reread"],
        ].map(([key, label, text]) => (
          <Field key={key} label={label}>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!f[key]}
                onChange={(e) => u(key, e.target.checked)}
                className="w-4 h-4 rounded accent-brand"
              />
              <span className="text-sm font-medium text-text-muted">{text}</span>
            </label>
          </Field>
        ))}
      </div>

      <SectionHeader icon="fa-sticky-note" title="Notes & Other" />
      <Field label="Cover Image">
        <ImagePicker
          ownerType="h-comic"
          ownerId={ownerId}
          role="cover"
          value={f.cover_image_file}
          onChange={(key, imageId) => {
            u("cover_image_file", key);
            u("pending_image_id", ownerId ? null : imageId);
          }}
        />
      </Field>
      <Field label="Remark">
        <textarea
          className={inputCls}
          rows={3}
          value={f.remark}
          onChange={(e) => u("remark", e.target.value)}
          placeholder="Private notes..."
        />
      </Field>
    </>
  );
}

/**
 * The franchise and series pickers, shared by both h-comic tabs. The h-comic
 * family's franchises only - H-Comic, and Hentai, which an h-comic may share
 * with its adaptation.
 */
export function HComicLineageFields({
  f,
  u,
  allFranchises,
  seriesItemsForHComic,
  franchiseCollections,
}) {
  return (
    <FamilyLineageFields
      f={f}
      u={u}
      family="h-comic"
      hint="H-Comic and Hentai franchises only"
      allFranchises={allFranchises}
      seriesItems={seriesItemsForHComic}
      franchiseCollections={franchiseCollections}
    />
  );
}

export default function HComicAddTab({
  franchiseCollections,
  hcf,
  uhc,
  allFranchises,
  seriesItemsForHComic,
  sources,
}) {
  // A new entry's untouched suggested restricted sources follow the region
  // (lib/hComicRestrictedSources.js). Only on Add: an existing entry's rows
  // are the owner's, and Modify offers the prefill button instead.
  const setRegion = (key, value) => {
    uhc(key, value);
    uhc("sources", followRegion(hcf.sources, hcf.region, value));
  };
  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6 space-y-2">
      <SectionHeader icon="fa-book" title="Titles & Naming" />
      <HComicRegionField f={hcf} u={setRegion} />
      <HComicLineageFields
        f={hcf}
        u={uhc}
        allFranchises={allFranchises}
        seriesItemsForHComic={seriesItemsForHComic}
        franchiseCollections={franchiseCollections}
      />
      <HComicFormBody f={hcf} u={uhc} sources={sources} />
    </div>
  );
}
