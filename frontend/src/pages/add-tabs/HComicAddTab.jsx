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
import EntryAutofillSearch from "../../components/forms/EntryAutofillSearch";
import FamilyLineageFields from "../../components/forms/FamilyLineageFields";
import {
  Field,
  SectionHeader,
  inputCls,
  selectCls,
} from "../../components/forms/FormField";
import CoverRemarkFields from "../../components/forms/CoverRemarkFields";
import EntryFlags from "../../components/forms/EntryFlags";
import EntryNameFields from "../../components/forms/EntryNameFields";
import MultiSelect from "../../components/forms/MultiSelect";
import ReleaseDateInput from "../../components/forms/ReleaseDateInput";
import SourcesEditor from "../../components/forms/SourcesEditor";
import TagReplace from "../../components/forms/TagReplace";
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
import { RESTRICTED_FAMILY } from "../../lib/gatedTypes";
import { showsField } from "../../lib/hComicRegion";
import { followRegion, restrictedSourcesFor } from "../../lib/restrictedSources";
import { usePrefillPicks } from "../../contexts/RestrictedPrefillContext";
import { getDisplayName, getSourceValues } from "../../utils/media";

export { defaultHComic } from "../../config/formFactories";

// The franchise type a new h-comic franchise is created with. The picker
// offers the whole restricted family (FamilyLineageFields).
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

/** The region select, in the left half of its own row. Rendered first by
 *  both tabs. */
export function HComicRegionField({ f, u }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field
        label="Region"
        required
        hint="JP counts pages, KR counts chapters - the rest of the form follows"
      >
        <select
          className={selectCls}
          aria-label="Region"
          value={f.region ?? ""}
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
    </div>
  );
}

/**
 * Every field below the region and the lineage pickers, shared verbatim by
 * the Modify tab. `ownerId` is passed by the Modify tab only, where the row
 * exists; without it a picked cover waits in `pending_image_id` for the Add
 * page to attach once the entry is saved (CoverRemarkFields).
 */
export function HComicFormBody({ f, u, sources, ownerId }) {
  const shows = (field) => showsField(f.region, field);
  const picks = usePrefillPicks("h-comic");

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
        min="0"
        aria-label={label}
        value={f[key] ?? ""}
        onChange={(e) => u(key, e.target.value)}
        placeholder="0"
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
      {/* The region's own native name only. The other one is kept if it was
          ever filled in, but not shown. */}
      <EntryNameFields
        f={f}
        u={u}
        prefix="h_comic"
        label="H-Comic"
        names={["cn", "en", "jp", "kr", "alt"]}
        shows={shows}
      />

      <SectionHeader icon="fa-chart-bar" title="My Tracker" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Reading Status">
          <select
            className={selectCls}
            aria-label="Reading Status"
            value={f.reading_status ?? ""}
            onChange={(e) => u("reading_status", e.target.value)}
          >
            <StatusOptions statuses={READING_STATUSES} />
          </select>
        </Field>
        {select("my_rating", "My Rating", MY_RATINGS)}
        {select("usefulness", "Usefulness", H_COMIC_USEFULNESS)}
      </div>
      {/* JP counts pages, KR chapters; neither until a region is chosen. */}
      {f.region && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {shows("page_fin") && num("page_fin", "Pages Read")}
          {shows("page_total") && num("page_total", "Page Total")}
          {shows("ch_fin") && num("ch_fin", "Chapters Read")}
          {shows("ch_total") && num("ch_total", "Chapter Total")}
        </div>
      )}
      <EntryFlags
        f={f}
        u={u}
        flags={[
          ["read_next", "Read Next", "Add to Read Next list"],
          ["to_reread", "To Reread", "Mark for reread"],
        ]}
      />

      <SectionHeader icon="fa-info-circle" title="Information" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {select("serialization_status", "Serialization Status", MANGA_SERIALIZATION_STATUSES)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ReleaseDateInput
          label="Release Date"
          value={f.release_date}
          onChange={(v) => u("release_date", v)}
        />
        <ReleaseDateInput label="End Date" value={f.end_date} onChange={(v) => u("end_date", v)} />
      </div>
      {shows("ch_behind") && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {num("ch_behind", "Chapters Behind Official", "Set by hand")}
        </div>
      )}
      {(shows("originality") || shows("animation_status") || shows("series_number")) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
          {shows("series_number") &&
            num("series_number", "Series Number", "Its place in its series")}
        </div>
      )}

      <SectionHeader icon="fa-tags" title="Genres" />
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
      <TagReplace
        mediaType="h-comic"
        franchiseId={f.franchise_id}
        seriesId={f.series_id}
        entryId={ownerId}
        fields={["h_genre_plot", "h_genre_appearance", "h_genre_relation"]}
        what="genres"
        onChange={u}
      />

      <SectionHeader icon="fa-pen-nib" title="Production" />
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Author">
            {tagField(
              "author",
              { kind: "person", role: "author", scope: "h-comic" },
              "Select or type author..."
            )}
          </Field>
        </div>
      )}

      {/* Characters are real character rows, cast without a seiyuu - the
          cast is saved through PUT /api/casting/h-comic/{id} once the entry
          exists, never as part of the entry payload. */}
      <SectionHeader icon="fa-users" title="Cast" />
      <CastEditor
        mediaType="h-comic"
        value={f.cast}
        onChange={(v) => u("cast", v)}
        franchiseId={f.franchise_id}
        malLink={f.mal_link}
        entryId={ownerId}
      />

      {/* The MAL id is not typed in: the write hook derives it from the
          link, and Tenrai fills the serialization status, the dates, the
          cover and a finished KR entry's chapter total from it where they
          are blank. The E-Hentai gallery is the second fill source, after
          MAL: the cover and the illustrator, where still blank. */}
      <SectionHeader icon="fa-external-link-alt" title="Links & Sources" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      <Field label="E-Hentai Link">
        <input
          className={inputCls}
          type="url"
          aria-label="E-Hentai Link"
          value={f.ehentai_link ?? ""}
          onChange={(e) => u("ehentai_link", e.target.value)}
          placeholder="https://e-hentai.org/g/.../.../"
        />
      </Field>
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
        restrictedSources={restrictedSourcesFor("h-comic", f.region, picks)}
      />

      <CoverRemarkFields f={f} u={u} ownerType="h-comic" ownerId={ownerId} />
    </>
  );
}

/**
 * The franchise and series pickers, shared by both h-comic tabs. The
 * restricted family's franchises only - H-Comic, Hentai, which an h-comic may
 * share with its adaptation, and H-Game.
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
      family={RESTRICTED_FAMILY}
      hint="H-Comic, Hentai and H-Game franchises only"
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
  allHComics,
  hComicsLoading,
  applyHComicEntryAutofill,
  seriesItemsForHComic,
  sources,
}) {
  // A new entry's untouched suggested restricted sources follow the region
  // (lib/restrictedSources.js). Only on Add: an existing entry's rows
  // are the owner's, and Modify offers the prefill button instead.
  const picks = usePrefillPicks("h-comic");
  const setRegion = (key, value) => {
    uhc(key, value);
    uhc("sources", followRegion(hcf.sources, hcf.region, value, picks));
  };
  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6 space-y-2">
      <EntryAutofillSearch
        items={allHComics}
        names={(h) => [
          h.h_comic_name_cn,
          h.h_comic_name_en,
          h.h_comic_name_alt,
          h.h_comic_name_jp,
          h.h_comic_name_kr,
        ]}
        title={(h) => getDisplayName(h, "h-comic")}
        badge={(h) => h.region}
        franchises={allFranchises}
        onPick={applyHComicEntryAutofill}
        loading={hComicsLoading}
      />
      <SectionHeader icon="fa-tag" title="Titles & Naming" />
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
