// Frontend: add tab page file for TvShowAddTab.
//
// Two boxes at the top, as on every media tab: EntryAutofillSearch copies
// fields from a TV show already in the catalogue, and the TMDB search under
// it links the new entry to its IMDb id. Below them sit the lineage pickers
// and the form body, both exported for TvShowModifyTab, so the two pages
// render one definition of the TV form and differ only in the wrapper.
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
  IS_MAIN,
  MY_RATINGS,
  TV_REGIONS,
  WATCHING_STATUSES,
} from "../../config/fieldOptions";
import { endpoints } from "../../api/endpoints";

export { defaultTvShow } from "../../config/formFactories";

const row2 = "grid grid-cols-1 md:grid-cols-2 gap-4";
const row3 = "grid grid-cols-1 md:grid-cols-3 gap-4";

/**
 * Every field below the franchise/series pickers, shared verbatim by the
 * Modify tab. `ownerId` is the show's id on Modify and absent on Add - the
 * only difference between the two pages inside the body (cover attachment
 * and TagReplace's "this entry").
 */
export function TvShowFormBody({ f, u, sources, ownerId }) {
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
  const count = (key, label, placeholder) => (
    <Field label={label}>
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
      <EntryNameFields f={f} u={u} prefix="tv" label="TV" names={["cn", "en", "alt"]} />

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
      <EntryFlags
        f={f}
        u={u}
        flags={[
          ["watch_next", "Watch Next", "Add to Watch Next list"],
          ["to_rewatch", "To Rewatch", "Mark for rewatch"],
        ]}
      />

      <SectionHeader icon="fa-info-circle" title="Information" />
      <div className={row3}>
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
        {choice("region", "Region", TV_REGIONS)}
      </div>
      <div className={row2}>
        {choice("airing_status", "Airing Status", AIRING_STATUSES)}
        <ReleaseDateInput
          label="Release Date"
          value={f.release_date}
          onChange={(v) => u("release_date", v)}
        />
      </div>

      <GenreLabelFields
        mediaType="tv-show"
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
              scope: "tv-show",
              usage: "origin",
            })}
            value={f.original_source ?? ""}
            onChange={(v) => u("original_source", v)}
            placeholder="e.g. Netflix, HBO"
          />
        </Field>
      </div>
      <SourcesEditor
        value={f.sources}
        onChange={(rows) => u("sources", rows)}
        mediaType="tv-show"
        sources={sources}
      />

      <CoverRemarkFields f={f} u={u} ownerType="tv-show" ownerId={ownerId} />
    </>
  );
}

/** TV franchises, or untyped ones - a franchise of any other type is not offered. */
const acceptsTvFranchise = (type) => !type || parseTypes(type).includes("TV");

/** The franchise and series pickers, shared by both TV show tabs. */
export function TvShowLineageFields({
  f,
  u,
  allFranchises,
  seriesItemsForTvShow,
  franchiseCollections,
}) {
  return (
    <FamilyLineageFields
      f={f}
      u={u}
      accepts={acceptsTvFranchise}
      allFranchises={allFranchises}
      seriesItems={seriesItemsForTvShow}
      franchiseCollections={franchiseCollections}
    />
  );
}

export default function TvShowAddTab({
  franchiseCollections,
  tvf,
  utf,
  allTvShows,
  tvShowsLoading = false,
  applyTvShowEntryAutofill,
  applyTmdbPick,
  allFranchises,
  seriesItemsForTvShow,
  sources,
}) {
  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6 space-y-2">
      <EntryAutofillSearch
        items={allTvShows}
        names={(t) => [t.tv_name_en, t.tv_name_cn, t.tv_name_alt]}
        title={(t) => t.tv_name_cn || t.tv_name_en}
        franchises={allFranchises}
        badge={(t) => t.region}
        onPick={applyTvShowEntryAutofill}
        loading={tvShowsLoading}
      />
      <ExternalSearchBox
        source="TMDB"
        searchUrl={endpoints.tvShow.searchTmdb}
        onPick={applyTmdbPick}
        hint="A pick looks up the IMDb id TMDB holds for it; the entry is keyed by IMDb."
      />
      <SectionHeader icon="fa-tag" title="Titles & Naming" />
      <TvShowLineageFields
        f={tvf}
        u={utf}
        allFranchises={allFranchises}
        seriesItemsForTvShow={seriesItemsForTvShow}
        franchiseCollections={franchiseCollections}
      />
      <TvShowFormBody f={tvf} u={utf} sources={sources} />
    </div>
  );
}
