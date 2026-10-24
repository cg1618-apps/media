// Frontend: add tab page file for CartoonAddTab.
//
// Two boxes at the top, as on every media tab: EntryAutofillSearch copies
// fields from a cartoon already in the catalogue, and the TMDB search under
// it links the new entry to its IMDb id. Below them sit the lineage pickers
// and the form body, both exported for CartoonModifyTab, so the two pages
// render one definition of the cartoon form and differ only in the wrapper.
import CoverRemarkFields from "../../components/forms/CoverRemarkFields";
import EntryAutofillSearch from "../../components/forms/EntryAutofillSearch";
import EntryFlags from "../../components/forms/EntryFlags";
import EntryNameFields from "../../components/forms/EntryNameFields";
import ExternalSearchBox from "../../components/forms/ExternalSearchBox";
import FamilyLineageFields from "../../components/forms/FamilyLineageFields";
import GenreLabelFields from "../../components/forms/GenreLabelFields";
import MultiSelect from "../../components/forms/MultiSelect";
import ReleaseDateInput from "../../components/forms/ReleaseDateInput";
import SourcesEditor from "../../components/forms/SourcesEditor";
import { Field, SectionHeader, inputCls, selectCls } from "../../components/forms/FormField";
import StatusOptions from "../../components/ui/StatusOptions";
import { getSourceValues, parseTypes } from "../../utils/media";
import {
  AIRING_STATUSES,
  CARTOON_AIRING_TYPES,
  IS_MAIN,
  MY_RATINGS,
  WATCHING_STATUSES,
} from "../../config/fieldOptions";
import { endpoints } from "../../api/endpoints";

export { defaultCartoon } from "../../config/formFactories";

const row2 = "grid grid-cols-1 md:grid-cols-2 gap-4";
const row3 = "grid grid-cols-1 md:grid-cols-3 gap-4";

/**
 * Every field below the franchise/series pickers, shared verbatim by the
 * Modify tab. `ownerId` is the cartoon's id on Modify and absent on Add - the
 * only difference between the two pages inside the body (cover attachment
 * and TagReplace's "this entry"). Cartoon has no to_rewatch column, so its
 * flags row is Watch Next alone.
 */
export function CartoonFormBody({ f, u, sources, ownerId }) {
  const choice = (key, label, options) => (
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
  const count = (key, label, placeholder, hint) => (
    <Field label={label} hint={hint}>
      <input
        className={inputCls}
        type="number"
        min="0"
        aria-label={label}
        value={f[key] ?? ""}
        onChange={(e) => u(key, e.target.value)}
        placeholder={placeholder}
      />
    </Field>
  );

  return (
    <>
      <EntryNameFields f={f} u={u} prefix="cartoon" label="Cartoon" names={["cn", "en", "alt"]} />

      <SectionHeader icon="fa-star" title="Scores" />
      <div className={row2}>
        {/* This season's rating, and the whole show's beside it. Fill
            computes the first from the season's episodes. */}
        <Field label="IMDb Rating" hint="this season">
          <input
            className={inputCls}
            type="number"
            step="0.1"
            min="0"
            max="10"
            aria-label="IMDb Rating"
            value={f.imdb_rating ?? ""}
            onChange={(e) => u("imdb_rating", e.target.value)}
            placeholder="9.2"
          />
        </Field>
        <Field label="IMDb Show Rating" hint="the whole show">
          <input
            className={inputCls}
            type="number"
            step="0.1"
            min="0"
            max="10"
            aria-label="IMDb Show Rating"
            value={f.imdb_series_rating ?? ""}
            onChange={(e) => u("imdb_series_rating", e.target.value)}
            placeholder="9.0"
          />
        </Field>
      </div>

      <SectionHeader icon="fa-chart-bar" title="My Tracker" />
      <div className={row2}>
        <Field label="Watching Status">
          <select
            className={selectCls}
            aria-label="Watching Status"
            value={f.watching_status ?? ""}
            onChange={(e) => u("watching_status", e.target.value)}
          >
            <StatusOptions statuses={WATCHING_STATUSES} />
          </select>
        </Field>
        {choice("my_rating", "My Rating", MY_RATINGS)}
      </div>
      <div className={row3}>
        {count("ep_fin", "Episodes Finished", "0")}
        {count("ep_total", "Total Episodes", "10")}
        <Field label="Paused at">
          <input
            className={inputCls}
            type="text"
            aria-label="Paused at"
            value={f.time_fin ?? ""}
            onChange={(e) => u("time_fin", e.target.value)}
            placeholder="14:35"
          />
        </Field>
      </div>
      <EntryFlags f={f} u={u} flags={[["watch_next", "Watch Next", "Add to Watch Next list"]]} />

      <SectionHeader icon="fa-info-circle" title="Information" />
      <div className={row2}>
        {choice("is_main", "Is Main", IS_MAIN)}
        <Field label="Season">
          <input
            className={inputCls}
            aria-label="Season"
            value={f.season_part ?? ""}
            onChange={(e) => u("season_part", e.target.value)}
            placeholder="e.g. Season 1"
          />
        </Field>
      </div>
      <div className={row2}>
        {choice("airing_type", "Airing Type", CARTOON_AIRING_TYPES)}
        {choice("airing_status", "Airing Status", AIRING_STATUSES)}
      </div>
      <div className={row2}>
        <ReleaseDateInput
          label="Release Date"
          value={f.release_date}
          onChange={(v) => u("release_date", v)}
        />
        {count("length_ep_min", "Ep Length (min)", "22", "Minutes per episode")}
      </div>

      <GenreLabelFields
        mediaType="cartoon"
        values={f}
        onChange={u}
        sources={sources}
        franchiseId={f.franchise_id}
        seriesId={f.series_id}
        entryId={ownerId}
      />

      <SectionHeader icon="fa-external-link-alt" title="Links & Sources" />
      <div className={row2}>
        <Field label="IMDb ID" hint="Full IMDb ID (e.g. tt1234567)">
          <input
            className={inputCls}
            type="text"
            aria-label="IMDb ID"
            value={f.imdb_id ?? ""}
            onChange={(e) => u("imdb_id", e.target.value)}
            placeholder="tt1234567"
          />
        </Field>
        <Field label="IMDb Link">
          <input
            className={inputCls}
            type="url"
            aria-label="IMDb Link"
            value={f.imdb_link ?? ""}
            onChange={(e) => u("imdb_link", e.target.value)}
            placeholder="https://www.imdb.com/title/tt..."
          />
        </Field>
      </div>
      <div className={row2}>
        <Field label="Original Source">
          <MultiSelect
            options={getSourceValues(sources, {
              kind: "option",
              category: "Platform",
              scope: "cartoon",
              usage: "origin",
            })}
            value={f.original_source ?? ""}
            onChange={(v) => u("original_source", v)}
            placeholder="e.g. Disney+, Cartoon Network"
          />
        </Field>
      </div>
      <SourcesEditor
        value={f.sources}
        onChange={(rows) => u("sources", rows)}
        mediaType="cartoon"
        sources={sources}
      />

      <CoverRemarkFields f={f} u={u} ownerType="cartoon" ownerId={ownerId} />
    </>
  );
}

/** Cartoon franchises, or untyped ones - a franchise of any other type is not offered. */
const acceptsCartoonFranchise = (type) => !type || parseTypes(type).includes("Cartoon");

/** The franchise and series pickers, shared by both cartoon tabs. */
export function CartoonLineageFields({
  f,
  u,
  allFranchises,
  seriesItemsForCartoon,
  franchiseCollections,
}) {
  return (
    <FamilyLineageFields
      f={f}
      u={u}
      accepts={acceptsCartoonFranchise}
      allFranchises={allFranchises}
      seriesItems={seriesItemsForCartoon}
      franchiseCollections={franchiseCollections}
    />
  );
}

export default function CartoonAddTab({
  franchiseCollections,
  cf,
  uc,
  allCartoons,
  cartoonsLoading = false,
  applyCartoonEntryAutofill,
  applyTmdbPick,
  allFranchises,
  seriesItemsForCartoon,
  sources,
}) {
  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6 space-y-2">
      <EntryAutofillSearch
        items={allCartoons}
        names={(c) => [c.cartoon_name_en, c.cartoon_name_cn, c.cartoon_name_alt]}
        title={(c) => c.cartoon_name_cn || c.cartoon_name_en}
        franchises={allFranchises}
        badge={(c) => c.airing_type}
        onPick={applyCartoonEntryAutofill}
        loading={cartoonsLoading}
      />
      <ExternalSearchBox
        source="TMDB"
        searchUrl={endpoints.cartoon.searchTmdb}
        onPick={applyTmdbPick}
        hint="A pick looks up the IMDb id TMDB holds for it; the entry is keyed by IMDb."
      />
      <SectionHeader icon="fa-tag" title="Titles & Naming" />
      <CartoonLineageFields
        f={cf}
        u={uc}
        allFranchises={allFranchises}
        seriesItemsForCartoon={seriesItemsForCartoon}
        franchiseCollections={franchiseCollections}
      />
      <CartoonFormBody f={cf} u={uc} sources={sources} />
    </div>
  );
}
