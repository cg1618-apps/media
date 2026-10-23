// Frontend: add tab page file for AnimeAddTab.
//
// AnimeFormBody and AnimeLineageFields are the whole anime form, shared
// verbatim by AnimeModifyTab, so the two pages lay out the same fields in the
// same order (the detail page's). The Add wrapper adds only the two search
// boxes on top: EntryAutofillSearch copies fields from an anime already in
// the catalogue, the MAL search links the new entry to its MAL record.
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
import { WEEKDAYS } from "../../config/weekdays";
import { broadcastTimeOptions } from "../../config/broadcastTimes";
import {
  AIRING_STATUSES,
  ANIME_AIRING_TYPES,
  IS_MAIN,
  MY_RATINGS,
  PART_NUMS,
  RELEASE_SEASONS,
  SEASON_NUMS,
  WATCHING_STATUSES,
} from "../../config/fieldOptions";
import StatusOptions from "../../components/ui/StatusOptions";
import { endpoints } from "../../api/endpoints";

export { defaultAnime } from "../../config/formFactories";

const ROW2 = "grid grid-cols-1 md:grid-cols-2 gap-4";
const ROW3 = "grid grid-cols-1 md:grid-cols-3 gap-4";
const ROW4 = "grid grid-cols-1 md:grid-cols-4 gap-4";

/**
 * Every field below the franchise/series pickers. `f` is the form state and
 * `u` its updater; `ownerId` is the entry's id on Modify and absent on Add -
 * the only difference between the two pages inside the body.
 */
export function AnimeFormBody({ f, u, sources, ownerId }) {
  const select = (key, label, options, text = (v) => v) => (
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
            {text(v)}
          </option>
        ))}
      </select>
    </Field>
  );
  const count = (key, label, attrs) => (
    <Field label={label}>
      <input
        className={inputCls}
        type="number"
        min="0"
        aria-label={label}
        value={f[key] ?? ""}
        onChange={(e) => u(key, e.target.value)}
        placeholder="0"
        {...attrs}
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
        limit={null}
        {...attrs}
      />
    </Field>
  );

  return (
    <>
      <EntryNameFields f={f} u={u} prefix="anime" label="Anime" />

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
      <div className={ROW3}>
        {count("ep_fin", "EP Finished")}
        {count("ep_total", "EP Total")}
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
      <div className={ROW4}>
        {count("ep_previous", "EP Previous")}
        {select("broadcast_day", "Broadcast Day", WEEKDAYS)}
        {select(
          "broadcast_time",
          "Broadcast Time",
          broadcastTimeOptions(f.broadcast_time),
        )}
        {select("my_watch_day", "My Watch Day", WEEKDAYS)}
      </div>
      <EntryFlags
        f={f}
        u={u}
        flags={[["watch_next", "Watch Next", "Add to Watch Next list"]]}
      />

      {/* Season and Part are form-only: the payload derives season_part
          from them. */}
      <SectionHeader icon="fa-info-circle" title="Information" />
      <div className={ROW3}>
        {select("is_main", "Main / Spinoff", IS_MAIN)}
        {select("season_num", "Season", SEASON_NUMS, (n) => `Season ${n}`)}
        {select("part_num", "Part", PART_NUMS, (n) => `Part ${n}`)}
      </div>
      <div className={ROW2}>
        {select("airing_type", "Airing Type", ANIME_AIRING_TYPES)}
        {select("airing_status", "Airing Status", AIRING_STATUSES)}
      </div>
      <div className={ROW2}>
        {select("release_season", "Release Season", RELEASE_SEASONS)}
        <ReleaseDateInput
          label="Release Date"
          value={f.release_date}
          onChange={(v) => u("release_date", v)}
        />
      </div>
      <div className={ROW2}>{count("ep_special", "EP Special", { step: "0.01" })}</div>

      <GenreLabelFields
        mediaType="anime"
        values={f}
        onChange={u}
        sources={sources}
        franchiseId={f.franchise_id}
        seriesId={f.series_id}
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
          { kind: "publisher", scope: "anime" },
          "Select distributor...",
        )}
      </div>
      <div className={ROW2}>
        {tags(
          "director",
          "Director",
          { kind: "person", role: "director", scope: "anime" },
          "Select director...",
        )}
        {tags(
          "producer",
          "Producer",
          { kind: "person", role: "producer" },
          "Select producer...",
        )}
      </div>
      <div className={ROW2}>
        {tags(
          "music",
          "Music / Composer",
          { kind: "person", role: "composer" },
          "Select composer...",
        )}
      </div>

      {/* Cast: character/seiyuu/role rows, saved separately via
          PUT /api/casting/anime/{id} - never part of the entry payload. */}
      <SectionHeader icon="fa-users" title="Cast" />
      <CastEditor
        mediaType="anime"
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
          { kind: "option", category: "Platform", scope: "anime", usage: "origin" },
          "Select exclusive platform...",
          { max: 1 },
        )}
      </div>
      <SourcesEditor
        value={f.sources}
        onChange={(rows) => u("sources", rows)}
        mediaType="anime"
        sources={sources}
      />

      <CoverRemarkFields f={f} u={u} ownerType="anime" ownerId={ownerId} />
    </>
  );
}

/** The franchise and series pickers, shared by both anime tabs. Anime
 *  accepts a franchise of every type. */
export function AnimeLineageFields({
  f,
  u,
  allFranchises,
  seriesItemsForAnime,
  franchiseCollections,
}) {
  return (
    <FamilyLineageFields
      f={f}
      u={u}
      allFranchises={allFranchises}
      seriesItems={seriesItemsForAnime ?? []}
      franchiseCollections={franchiseCollections}
    />
  );
}

export default function AnimeAddTab({
  franchiseCollections,
  af,
  ua,
  allAnime,
  animeLoading = false,
  applyAnimeEntryAutofill,
  applyMalPick,
  allFranchises,
  seriesItemsForAnime,
  sources,
}) {
  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6 space-y-2">
      <EntryAutofillSearch
        items={allAnime}
        names={(a) => [
          a.anime_name_en,
          a.anime_name_cn,
          a.anime_name_roman,
          a.anime_name_jp,
          a.anime_name_alt,
        ]}
        title={(a) => a.anime_name_cn || a.anime_name_en}
        franchises={allFranchises}
        badge={(a) => a.airing_type}
        onPick={applyAnimeEntryAutofill}
        loading={animeLoading}
      />
      <ExternalSearchBox
        source="MAL"
        searchUrl={endpoints.anime.searchMal}
        onPick={applyMalPick}
      />
      <SectionHeader icon="fa-tag" title="Titles & Naming" />
      <AnimeLineageFields
        f={af}
        u={ua}
        allFranchises={allFranchises}
        seriesItemsForAnime={seriesItemsForAnime}
        franchiseCollections={franchiseCollections}
      />
      <AnimeFormBody f={af} u={ua} sources={sources} />
    </div>
  );
}
