// Frontend: add tab page file for MovieAddTab.
//
// Two boxes at the top, as on every media tab: EntryAutofillSearch copies
// fields from a movie already in the catalogue, and the TMDB search under it
// links the new entry to its IMDb id. Below them sit the lineage pickers and
// the form body, both exported for MovieModifyTab, so the two pages render
// one definition of the movie form and differ only in the wrapper.
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
  MOVIE_TYPES,
  MY_RATINGS,
  WATCHING_STATUSES,
} from "../../config/fieldOptions";
import { endpoints } from "../../api/endpoints";

export { defaultMovie } from "../../config/formFactories";

const row2 = "grid grid-cols-1 md:grid-cols-2 gap-4";

/**
 * Every field below the franchise/series pickers, shared verbatim by the
 * Modify tab. `ownerId` is the movie's id on Modify and absent on Add - the
 * only difference between the two pages inside the body (cover attachment
 * and TagReplace's "this entry").
 */
export function MovieFormBody({ f, u, sources, ownerId }) {
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

  return (
    <>
      <EntryNameFields f={f} u={u} prefix="movie" label="Movie" names={["cn", "en", "alt"]} />

      <SectionHeader icon="fa-star" title="Scores" />
      <div className={row2}>
        <Field label="IMDb Rating" hint="e.g. 9.2">
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
      <div className={row2}>
        <Field label="Paused at">
          <input
            className={inputCls}
            type="text"
            aria-label="Paused at"
            value={f.time_fin ?? ""}
            onChange={(e) => u("time_fin", e.target.value)}
            placeholder="1:10:00"
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
      <div className={row2}>
        {choice("is_main", "Main / Spinoff", IS_MAIN)}
        {choice("movie_type", "Movie Type", MOVIE_TYPES)}
      </div>
      <div className={row2}>{choice("airing_status", "Airing Status", AIRING_STATUSES)}</div>
      <div className={row2}>
        <ReleaseDateInput
          label="Release Date TW"
          value={f.release_date_tw}
          onChange={(v) => u("release_date_tw", v)}
        />
        <ReleaseDateInput
          label="Release Date USA"
          value={f.release_date_usa}
          onChange={(v) => u("release_date_usa", v)}
        />
      </div>
      <div className={row2}>
        <Field label="Length (min)">
          <input
            className={inputCls}
            type="number"
            min="0"
            aria-label="Length (min)"
            value={f.length_min ?? ""}
            onChange={(e) => u("length_min", e.target.value)}
            placeholder="120"
          />
        </Field>
      </div>

      <GenreLabelFields
        mediaType="movie"
        values={f}
        onChange={u}
        sources={sources}
        franchiseId={f.franchise_id}
        seriesId={f.series_id}
        entryId={ownerId}
      />

      <SectionHeader icon="fa-pen-nib" title="Production" />
      <div className={row2}>
        <Field label="Director">
          <MultiSelect
            options={getSourceValues(sources, {
              kind: "person",
              role: "director",
              scope: "non_anime",
            })}
            value={f.director ?? ""}
            onChange={(v) => u("director", v)}
            placeholder="Select or type director..."
          />
        </Field>
      </div>

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
              scope: "movie",
              usage: "origin",
            })}
            value={f.original_source ?? ""}
            onChange={(v) => u("original_source", v)}
            placeholder="Select original platform(s)..."
          />
        </Field>
      </div>
      <SourcesEditor
        value={f.sources}
        onChange={(rows) => u("sources", rows)}
        mediaType="movie"
        sources={sources}
      />

      <CoverRemarkFields f={f} u={u} ownerType="movie" ownerId={ownerId} />
    </>
  );
}

/** Movie franchises, or untyped ones - a franchise of any other type is not offered. */
const acceptsMovieFranchise = (type) => !type || parseTypes(type).includes("Movie");

/** The franchise and series pickers, shared by both movie tabs. */
export function MovieLineageFields({
  f,
  u,
  allFranchises,
  seriesItemsForMovie,
  franchiseCollections,
}) {
  return (
    <FamilyLineageFields
      f={f}
      u={u}
      accepts={acceptsMovieFranchise}
      allFranchises={allFranchises}
      seriesItems={seriesItemsForMovie}
      franchiseCollections={franchiseCollections}
    />
  );
}

export default function MovieAddTab({
  franchiseCollections,
  mf,
  umf,
  allMovies,
  moviesLoading = false,
  applyMovieEntryAutofill,
  applyTmdbPick,
  allFranchises,
  seriesItemsForMovie,
  sources,
}) {
  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6 space-y-2">
      <EntryAutofillSearch
        items={allMovies}
        names={(m) => [m.movie_name_en, m.movie_name_cn, m.movie_name_alt]}
        title={(m) => m.movie_name_cn || m.movie_name_en}
        franchises={allFranchises}
        badge={(m) => m.movie_type}
        onPick={applyMovieEntryAutofill}
        loading={moviesLoading}
      />
      <ExternalSearchBox
        source="TMDB"
        searchUrl={endpoints.movie.searchTmdb}
        onPick={applyTmdbPick}
        hint="A pick looks up the IMDb id TMDB holds for it; the entry is keyed by IMDb."
      />
      <SectionHeader icon="fa-tag" title="Titles & Naming" />
      <MovieLineageFields
        f={mf}
        u={umf}
        allFranchises={allFranchises}
        seriesItemsForMovie={seriesItemsForMovie}
        franchiseCollections={franchiseCollections}
      />
      <MovieFormBody f={mf} u={umf} sources={sources} />
    </div>
  );
}
