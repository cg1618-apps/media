// Frontend: add tab page file for AnimeMovieAddTab.
//
// AnimeMovieFormBody and AnimeMovieLineageFields are the whole anime movie
// form, shared verbatim by AnimeMovieModifyTab, so the two pages lay out the
// same fields in the same order (the detail page's). The Add wrapper adds only
// the two search boxes on top: EntryAutofillSearch copies fields from an anime
// movie already in the catalogue, the MAL search links the new entry to its
// MAL record. An anime movie has a franchise but no series.
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
import { getSourceValues } from "../../utils/media";
import { getIdleSourceValues } from "../../lib/formatters";
import {
  AIRING_STATUSES,
  MY_RATINGS,
  WATCHING_STATUSES,
} from "../../config/fieldOptions";
import StatusOptions from "../../components/ui/StatusOptions";
import { endpoints } from "../../api/endpoints";

export { defaultAnimeMovie } from "../../config/formFactories";

const ROW2 = "grid grid-cols-1 md:grid-cols-2 gap-4";

/**
 * Every field below the franchise picker. `f` is the form state and `u` its
 * updater; `ownerId` is the entry's id on Modify and absent on Add - the only
 * difference between the two pages inside the body.
 */
export function AnimeMovieFormBody({ f, u, sources, ownerId }) {
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
      <EntryNameFields f={f} u={u} prefix="anime_movie" label="Anime Movie" />

      <MalAnilistScores f={f} u={u} />

      <SectionHeader icon="fa-chart-bar" title="My Tracker" />
      <div className={ROW2}>
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
        {select("my_rating", "My Rating", MY_RATINGS)}
      </div>
      <div className={ROW2}>
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
      <div className={ROW2}>{select("airing_status", "Airing Status", AIRING_STATUSES)}</div>
      <div className={ROW2}>
        <ReleaseDateInput
          label="Release Date JP"
          value={f.release_date_jp}
          onChange={(v) => u("release_date_jp", v)}
        />
        <ReleaseDateInput
          label="Release Date TW"
          value={f.release_date_tw}
          onChange={(v) => u("release_date_tw", v)}
        />
      </div>
      <div className={ROW2}>
        <Field label="Length (min)">
          <input
            className={inputCls}
            type="number"
            min="0"
            aria-label="Length (min)"
            value={f.length_min ?? ""}
            onChange={(e) => u("length_min", e.target.value)}
            placeholder="e.g. 120"
          />
        </Field>
      </div>

      <GenreLabelFields
        mediaType="anime-movie"
        values={f}
        onChange={u}
        sources={sources}
        franchiseId={f.franchise_id}
        entryId={ownerId}
      />

      <SectionHeader icon="fa-pen-nib" title="Production" />
      <div className={ROW2}>
        {tags("studio", "Studio", { kind: "studio" }, "Select studio...", {
          idleOptions: getIdleSourceValues(sources, { kind: "studio" }),
        })}
        {tags(
          "distributor_tw",
          "Distributor TW",
          { kind: "publisher", scope: "anime-movie" },
          "Select distributor...",
          { limit: null },
        )}
      </div>
      <div className={ROW2}>
        {tags(
          "director",
          "Director",
          { kind: "person", role: "director", scope: "anime" },
          "Select director...",
        )}
      </div>

      {/* Cast: character/seiyuu/role rows, saved separately via
          PUT /api/casting/anime-movie/{id} - never part of the entry
          payload. */}
      <SectionHeader icon="fa-users" title="Cast" />
      <CastEditor
        mediaType="anime-movie"
        franchiseId={f.franchise_id}
        malLink={f.mal_link}
        entryId={ownerId}
        value={f.cast}
        onChange={(rows) => u("cast", rows)}
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
            placeholder="e.g. 5114"
          />
        </Field>
        <Field label="MAL Link">
          <input
            className={inputCls}
            type="url"
            aria-label="MAL Link"
            value={f.mal_link ?? ""}
            onChange={(e) => u("mal_link", e.target.value)}
            placeholder="https://myanimelist.net/anime/..."
          />
        </Field>
      </div>
      <div className={ROW2}>
        {tags(
          "exclusive_source",
          "Exclusive Source",
          {
            kind: "option",
            category: "Platform",
            scope: "anime-movie",
            usage: "origin",
          },
          "Select exclusive platform...",
          { limit: null, max: 1 },
        )}
      </div>
      <SourcesEditor
        value={f.sources}
        onChange={(rows) => u("sources", rows)}
        mediaType="anime-movie"
        sources={sources}
      />

      <CoverRemarkFields f={f} u={u} ownerType="anime-movie" ownerId={ownerId} />
    </>
  );
}

/** The franchise picker, shared by both anime movie tabs. Every franchise
 *  type is accepted, and there is no Series picker. */
export function AnimeMovieLineageFields({ f, u, allFranchises, franchiseCollections }) {
  return (
    <FamilyLineageFields
      f={f}
      u={u}
      allFranchises={allFranchises}
      franchiseCollections={franchiseCollections}
    />
  );
}

export default function AnimeMovieAddTab({
  franchiseCollections,
  amf,
  uam,
  allAnimeMovies,
  animeMoviesLoading = false,
  applyAnimeMovieEntryAutofill,
  applyMalPick,
  allFranchises,
  sources,
}) {
  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6 space-y-2">
      <EntryAutofillSearch
        items={allAnimeMovies}
        names={(m) => [
          m.anime_movie_name_en,
          m.anime_movie_name_cn,
          m.anime_movie_name_roman,
          m.anime_movie_name_jp,
          m.anime_movie_name_alt,
        ]}
        title={(m) => m.anime_movie_name_cn || m.anime_movie_name_en}
        franchises={allFranchises}
        onPick={applyAnimeMovieEntryAutofill}
        loading={animeMoviesLoading}
      />
      <ExternalSearchBox
        source="MAL"
        searchUrl={endpoints.animeMovie.searchMal}
        onPick={applyMalPick}
      />
      <SectionHeader icon="fa-tag" title="Titles & Naming" />
      <AnimeMovieLineageFields
        f={amf}
        u={uam}
        allFranchises={allFranchises}
        franchiseCollections={franchiseCollections}
      />
      <AnimeMovieFormBody f={amf} u={uam} sources={sources} />
    </div>
  );
}
