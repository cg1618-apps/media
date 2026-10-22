// Frontend: add tab page file for TvShowAddTab.
import GenreLabelFields from "../../components/forms/GenreLabelFields";
import ComboBox from "../../components/forms/ComboBox";
import MultiSelect from "../../components/forms/MultiSelect";
import SourcesEditor from "../../components/forms/SourcesEditor";
import ImagePicker from "../../components/forms/ImagePicker";
import {
  CollectionNote,
  Field,
  SectionHeader,
  inputCls,
  selectCls,
} from "../../components/forms/FormField";
import ReleaseDateInput from "../../components/forms/ReleaseDateInput";
import { getDisplayName, getSourceValues, parseTypes } from "../../utils/media";
import {
  AIRING_STATUSES,
  IS_MAIN,
  MY_RATINGS,
  TV_REGIONS,
  WATCHING_STATUSES,
} from "../../config/fieldOptions";
import StatusOptions from "../../components/ui/StatusOptions";
import EntryAutofillSearch from "../../components/forms/EntryAutofillSearch";
import ExternalSearchBox from "../../components/forms/ExternalSearchBox";
import { endpoints } from "../../api/endpoints";

export { defaultTvShow } from "../../config/formFactories";

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
        names={(t) => [
          t.tv_name_en,
          t.tv_name_cn,
          t.tv_name_alt,
        ]}
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
      <SectionHeader icon="fa-video" title="Titles & Naming" />
      <Field label="Franchise">
        <ComboBox
          items={allFranchises
            .filter(
              (f) =>
                parseTypes(f.franchise_type).includes("TV") ||
                !f.franchise_type,
            )
            .map((f) => ({
              id: f.system_id,
              label: getDisplayName(f, "franchise"),
              searchText: [
                f.franchise_name_cn,
                f.franchise_name_en,
                f.franchise_name_alt,
              ]
                .filter(Boolean)
                .join(" "),
            }))}
          selectedId={tvf.franchise_id}
          inputText={tvf.franchise_text}
          onSelect={(id, label) => {
            utf("franchise_id", id);
            utf("franchise_text", label);
            utf("series_id", null);
            utf("series_text", "");
          }}
          onType={(text) => {
            utf("franchise_text", text);
            utf("franchise_id", null);
            utf("series_id", null);
            utf("series_text", "");
          }}
          onClear={() => {
            utf("franchise_id", null);
            utf("franchise_text", "");
            utf("series_id", null);
            utf("series_text", "");
          }}
          placeholder="Search or type new franchise..."
          allowNew
        />
        <CollectionNote
          franchiseId={tvf.franchise_id}
          franchiseCollections={franchiseCollections}
        />
      </Field>
      <Field label="Series">
        <ComboBox
          items={seriesItemsForTvShow}
          selectedId={tvf.series_id}
          inputText={tvf.series_text}
          onSelect={(id, label) => {
            utf("series_id", id);
            utf("series_text", label);
          }}
          onType={(text) => {
            utf("series_text", text);
            utf("series_id", null);
          }}
          onClear={() => {
            utf("series_id", null);
            utf("series_text", "");
          }}
          placeholder="Search or type new series..."
          allowNew
        />
      </Field>
      <Field label="TV Name CN">
        <input
          className={inputCls}
          value={tvf.tv_name_cn}
          onChange={(e) => utf("tv_name_cn", e.target.value)}
          placeholder="Chinese title"
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="TV Name EN">
          <input
            className={inputCls}
            value={tvf.tv_name_en}
            onChange={(e) => utf("tv_name_en", e.target.value)}
            placeholder="English title"
          />
        </Field>
        <Field label="TV Name Alt">
          <input
            className={inputCls}
            value={tvf.tv_name_alt}
            onChange={(e) => utf("tv_name_alt", e.target.value)}
            placeholder="Alternative title"
          />
        </Field>
      </div>

      <SectionHeader icon="fa-chart-bar" title="Status & Classification" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Airing Status">
          <select
            className={selectCls}
            value={tvf.airing_status}
            onChange={(e) => utf("airing_status", e.target.value)}
          >
            <option value="">—</option>
            {AIRING_STATUSES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Watching Status">
          <select
            className={selectCls}
            value={tvf.watching_status}
            onChange={(e) => utf("watching_status", e.target.value)}
          >
            <StatusOptions statuses={WATCHING_STATUSES} />
          </select>
        </Field>
        <Field label="Is Main">
          <select
            className={selectCls}
            value={tvf.is_main}
            onChange={(e) => utf("is_main", e.target.value)}
          >
            <option value="">—</option>
            {IS_MAIN.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Total Episodes">
          <input
            className={inputCls}
            type="number"
            value={tvf.ep_total}
            onChange={(e) => utf("ep_total", e.target.value)}
            placeholder="10"
          />
        </Field>
        <Field label="Episodes Finished">
          <input
            className={inputCls}
            type="number"
            value={tvf.ep_fin}
            onChange={(e) => utf("ep_fin", e.target.value)}
            placeholder="0"
          />
        </Field>
        <Field label="Paused at">
          <input
            className={inputCls}
            type="text"
            aria-label="Paused at"
            value={tvf.time_fin ?? ""}
            onChange={(e) => utf("time_fin", e.target.value)}
            placeholder="14:35"
          />
        </Field>
        <Field label="My Rating">
          <select
            className={selectCls}
            value={tvf.my_rating}
            onChange={(e) => utf("my_rating", e.target.value)}
          >
            <option value="">—</option>
            {MY_RATINGS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="IMDB Rating" hint="e.g. 9.2">
        <input
          className={inputCls}
          value={tvf.imdb_rating}
          onChange={(e) => utf("imdb_rating", e.target.value)}
          placeholder="9.2"
        />
      </Field>
      <div className="flex flex-wrap gap-6 mt-2">
        <Field label="Watch Next">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!tvf.watch_next}
              onChange={(e) => utf("watch_next", e.target.checked)}
              className="w-4 h-4 rounded accent-brand"
            />
            <span className="text-sm font-medium text-text-muted">
              Add to Watch Next list
            </span>
          </label>
        </Field>
        <Field label="To Rewatch">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!tvf.to_rewatch}
              onChange={(e) => utf("to_rewatch", e.target.checked)}
              className="w-4 h-4 rounded accent-brand"
            />
            <span className="text-sm font-medium text-text-muted">
              Mark for rewatch
            </span>
          </label>
        </Field>
      </div>

      <SectionHeader icon="fa-film" title="Classification & Production" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Region">
          <select
            className={selectCls}
            value={tvf.region || ""}
            onChange={(e) => utf("region", e.target.value)}
          >
            <option value="">—</option>
            {TV_REGIONS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Original Source">
          <MultiSelect
            options={getSourceValues(sources, {
              kind: "option",
              category: "Platform",
              scope: "tv-show",
              usage: "origin",
            })}
            value={tvf.original_source}
            onChange={(v) => utf("original_source", v)}
            placeholder="e.g. Netflix, HBO"
          />
        </Field>
        <Field label="Season Part">
          <input
            className={inputCls}
            value={tvf.season_part}
            onChange={(e) => utf("season_part", e.target.value)}
            placeholder="e.g. Season 1"
          />
        </Field>
      </div>
      <ReleaseDateInput
        label="Release Date"
        value={tvf.release_date}
        onChange={(v) => utf("release_date", v)}
      />

      <GenreLabelFields
        mediaType="tv-show"
        values={tvf}
        onChange={utf}
        sources={sources}
        franchiseId={tvf.franchise_id}
        seriesId={tvf.series_id}
      />

      <SectionHeader icon="fa-link" title="Source & Links" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="IMDb ID" hint="Full IMDb ID (e.g. tt1234567)">
          <input
            className={inputCls}
            type="text"
            value={tvf.imdb_id}
            onChange={(e) => utf("imdb_id", e.target.value)}
            placeholder="tt1234567"
          />
        </Field>
        <Field label="IMDb Link">
          <input
            className={inputCls}
            type="url"
            value={tvf.imdb_link}
            onChange={(e) => utf("imdb_link", e.target.value)}
            placeholder="https://www.imdb.com/title/tt..."
          />
        </Field>
      </div>

      <SectionHeader icon="fa-broadcast-tower" title="Sources" />
      <SourcesEditor
        value={tvf.sources}
        onChange={(rows) => utf("sources", rows)}
        mediaType="tv-show"
        sources={sources}
      />

      <SectionHeader icon="fa-sticky-note" title="Notes & Other" />
      <Field label="Cover Image">
        <ImagePicker
          ownerType="tv-show"
          role="cover"
          value={tvf.cover_image_file}
          focus={tvf.cover_image_focus}
          onFocusChange={(focus) => utf("cover_image_focus", focus)}
          onChange={(key, imageId) => {
            utf("cover_image_file", key);
            utf("pending_image_id", imageId);
          }}
        />
      </Field>
      <Field label="Remark">
        <textarea
          className={inputCls}
          rows={3}
          value={tvf.remark}
          onChange={(e) => utf("remark", e.target.value)}
          placeholder="Private notes..."
        />
      </Field>
    </div>
  );
}
