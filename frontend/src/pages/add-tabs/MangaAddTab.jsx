// Frontend: add tab page file for MangaAddTab.
//
// MangaFormBody and MangaLineageFields are the whole manga form, shared
// verbatim by MangaModifyTab, so the two pages lay out the same fields in the
// same order (the detail page's). The Add wrapper adds only the two search
// boxes on top: EntryAutofillSearch copies fields from a manga already in the
// catalogue, the MAL search links the new entry to its MAL record.
import CastEditor from "../../components/forms/CastEditor";
import CoverRemarkFields from "../../components/forms/CoverRemarkFields";
import EntryAutofillSearch from "../../components/forms/EntryAutofillSearch";
import EntryFlags from "../../components/forms/EntryFlags";
import EntryNameFields from "../../components/forms/EntryNameFields";
import ExternalSearchBox from "../../components/forms/ExternalSearchBox";
import FamilyLineageFields from "../../components/forms/FamilyLineageFields";
import GenreLabelFields from "../../components/forms/GenreLabelFields";
import MalAnilistScores from "../../components/forms/MalAnilistScores";
import MultiSelect from "../../components/forms/MultiSelect";
import ReleaseDateInput from "../../components/forms/ReleaseDateInput";
import SourcesEditor from "../../components/forms/SourcesEditor";
import {
  Field,
  SectionHeader,
  inputCls,
  selectCls,
} from "../../components/forms/FormField";
import { getSourceValues, parseTypes } from "../../utils/media";
import { getIdleSourceValues } from "../../lib/formatters";
import { ANIME_STUDIO_SOURCE } from "../../config/formFields/fieldMeta";
import {
  IS_MAIN,
  MANGA_REGIONS,
  MANGA_SERIALIZATION_STATUSES,
  MY_RATINGS,
  READING_STATUSES,
} from "../../config/fieldOptions";
import StatusOptions from "../../components/ui/StatusOptions";
import { endpoints } from "../../api/endpoints";

export { defaultManga } from "../../config/formFactories";

const ROW2 = "grid grid-cols-1 md:grid-cols-2 gap-4";
const ROW3 = "grid grid-cols-1 md:grid-cols-3 gap-4";

/** A manga sits in an ACG or Manga franchise, or an untyped one. */
const acceptsMangaFranchise = (type) => {
  const types = parseTypes(type);
  return !type || types.includes("ACG") || types.includes("Manga");
};

/**
 * Every field below the franchise/series pickers. `f` is the form state and
 * `u` its updater; `ownerId` is the entry's id on Modify and absent on Add -
 * the only difference between the two pages inside the body.
 */
export function MangaFormBody({ f, u, sources, ownerId }) {
  const select = (key, label, options) => (
    <Field label={label}>
      <select
        className={selectCls}
        aria-label={label}
        value={f[key] ?? ""}
        onChange={(e) => u(key, e.target.value)}
      >
        <option value="">—</option>
        {options.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </Field>
  );
  const count = (key, label) => (
    <Field label={label}>
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
  const tags = (key, label, source, placeholder, attrs) => (
    <Field label={label}>
      <MultiSelect
        options={getSourceValues(sources, source)}
        value={f[key]}
        onChange={(v) => u(key, v)}
        placeholder={placeholder}
        {...attrs}
      />
    </Field>
  );

  return (
    <>
      <EntryNameFields f={f} u={u} prefix="manga" label="Manga" />

      <MalAnilistScores f={f} u={u} />

      <SectionHeader icon="fa-chart-bar" title="My Tracker" />
      <div className={ROW2}>
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
      </div>
      <div className={ROW2}>
        {count("ch_fin", "Ch Finished")}
        {count("ch_total", "Ch Total")}
      </div>
      <div className={ROW3}>
        {count("vol_fin", "Vol Finished")}
        {count("vol_total", "Vol Total")}
        {count("vol_fin_page", "Vol Fin Page")}
      </div>
      <EntryFlags
        f={f}
        u={u}
        flags={[
          ["read_next", "Read Next", "Add to Read Next list"],
          ["to_reread", "To Reread", "Mark for reread"],
        ]}
      />

      <SectionHeader icon="fa-info-circle" title="Information" />
      <div className={ROW2}>
        {select("region", "Region", MANGA_REGIONS)}
        {select("is_main", "Is Main", IS_MAIN)}
      </div>
      <div className={ROW2}>
        {select(
          "serialization_status",
          "Serialization Status",
          MANGA_SERIALIZATION_STATUSES,
        )}
      </div>
      <div className={ROW2}>
        <ReleaseDateInput
          label="Release Date"
          value={f.release_date}
          onChange={(v) => u("release_date", v)}
        />
        <ReleaseDateInput
          label="End Date"
          value={f.end_date}
          onChange={(v) => u("end_date", v)}
        />
      </div>

      <GenreLabelFields
        mediaType="manga"
        values={f}
        onChange={u}
        sources={sources}
        franchiseId={f.franchise_id}
        seriesId={f.series_id}
        entryId={ownerId}
      />

      <SectionHeader icon="fa-pen-nib" title="Production" />
      <div className={ROW2}>
        {tags(
          "author_plot",
          "Author (Plot)",
          { kind: "person", role: "author", scope: "manga" },
          "Select plot author...",
        )}
        {tags(
          "author_draw",
          "Author (Art)",
          { kind: "person", role: "illustrator", scope: "manga" },
          "Select art author...",
        )}
      </div>
      <div className={ROW2}>
        {tags(
          "publisher_tw",
          "Publisher TW",
          { kind: "publisher", scope: "manga" },
          "Select publisher...",
        )}
        {tags("anime_studio", "Anime Studio", ANIME_STUDIO_SOURCE, "Select studio...", {
          idleOptions: getIdleSourceValues(sources, ANIME_STUDIO_SOURCE),
        })}
      </div>

      {/* Cast: character/role rows (no seiyuu column - nobody voices anyone
          in a manga), saved separately via PUT /api/casting/manga/{id} -
          never part of the entry payload. */}
      <SectionHeader icon="fa-users" title="Cast" />
      <CastEditor
        mediaType="manga"
        franchiseId={f.franchise_id}
        malLink={f.mal_link}
        entryId={ownerId}
        value={f.cast}
        onChange={(v) => u("cast", v)}
      />

      <SectionHeader icon="fa-external-link-alt" title="Links & Sources" />
      <div className={ROW2}>
        <Field label="MAL ID">
          <input
            className={inputCls}
            type="number"
            aria-label="MAL ID"
            value={f.mal_id ?? ""}
            onChange={(e) => u("mal_id", e.target.value)}
            placeholder="12345"
          />
        </Field>
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
      <div className={ROW2}>
        {tags(
          "serialization_platform",
          "Serialization Platform",
          { kind: "option", category: "Serialization Platform", scope: "manga" },
          "e.g. 週刊少年ジャンプ",
        )}
      </div>
      <SourcesEditor
        value={f.sources}
        onChange={(rows) => u("sources", rows)}
        mediaType="manga"
        sources={sources}
      />

      <CoverRemarkFields f={f} u={u} ownerType="manga" ownerId={ownerId} />
    </>
  );
}

/** The franchise and series pickers, shared by both manga tabs. */
export function MangaLineageFields({
  f,
  u,
  allFranchises,
  seriesItemsForManga,
  franchiseCollections,
}) {
  return (
    <FamilyLineageFields
      f={f}
      u={u}
      accepts={acceptsMangaFranchise}
      allFranchises={allFranchises}
      seriesItems={seriesItemsForManga ?? []}
      franchiseCollections={franchiseCollections}
    />
  );
}

export default function MangaAddTab({
  franchiseCollections,
  mgf,
  umg,
  allMangas,
  mangasLoading = false,
  applyMangaEntryAutofill,
  applyMalPick,
  allFranchises,
  seriesItemsForManga,
  sources,
}) {
  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6 space-y-2">
      <EntryAutofillSearch
        items={allMangas}
        names={(m) => [
          m.manga_name_cn,
          m.manga_name_en,
          m.manga_name_roman,
          m.manga_name_jp,
          m.manga_name_alt,
        ]}
        title={(m) => m.manga_name_cn || m.manga_name_en}
        franchises={allFranchises}
        badge={(m) => m.region}
        onPick={applyMangaEntryAutofill}
        loading={mangasLoading}
      />
      <ExternalSearchBox
        source="MAL"
        searchUrl={endpoints.manga.searchMal}
        onPick={applyMalPick}
      />
      <SectionHeader icon="fa-tag" title="Titles & Naming" />
      <MangaLineageFields
        f={mgf}
        u={umg}
        allFranchises={allFranchises}
        seriesItemsForManga={seriesItemsForManga}
        franchiseCollections={franchiseCollections}
      />
      <MangaFormBody f={mgf} u={umg} sources={sources} />
    </div>
  );
}
