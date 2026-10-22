// Frontend: add tab page file for HentaiAddTab.
//
// The form of the gated hentai type, shared by the Add and Modify tabs the
// way HComicAddTab's is: this file exports the field body and the lineage
// pickers, and HentaiModifyTab renders them, so the two cannot drift.
//
// Simpler than h-comic's: no region, and cartoon's episode pair for
// progress - ep_total and ep_fin, no ep_previous or ep_special. The cast is
// anime's, seiyuu included, since a hentai is voiced. The `hentai` content label is
// the page's to lock on (ContentLabelPicker's `required`), not this form's.
import CastEditor from "../../components/forms/CastEditor";
import EntryAutofillSearch from "../../components/forms/EntryAutofillSearch";
import FamilyLineageFields from "../../components/forms/FamilyLineageFields";
import { Field, SectionHeader, inputCls, selectCls } from "../../components/forms/FormField";
import CoverRemarkFields from "../../components/forms/CoverRemarkFields";
import EntryFlags from "../../components/forms/EntryFlags";
import EntryNameFields from "../../components/forms/EntryNameFields";
import MultiSelect from "../../components/forms/MultiSelect";
import ReleaseDateInput from "../../components/forms/ReleaseDateInput";
import SourcesEditor from "../../components/forms/SourcesEditor";
import TagReplace from "../../components/forms/TagReplace";
import StatusOptions from "../../components/ui/StatusOptions";
import {
  AIRING_STATUSES,
  H_COMIC_ORIGINALITY,
  H_COMIC_USEFULNESS,
  HENTAI_SOURCE_MATERIALS,
  MY_RATINGS,
  WATCHING_STATUSES,
} from "../../config/fieldOptions";
import { HENTAI_SOURCES } from "../../lib/hentaiForm";
import { getDisplayName, getSourceValues } from "../../utils/media";
import { getIdleSourceValues } from "../../lib/formatters";
import { RESTRICTED_FAMILY } from "../../lib/gatedTypes";

export { defaultHentai } from "../../config/formFactories";

// The franchise type a new hentai franchise is created with. The picker
// offers the whole restricted family, so a hentai can join the franchise of
// the h-comic it adapts, or a doujin franchise holding all three types.
export const HENTAI_FRANCHISE_TYPE = "Hentai";

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

/**
 * Every field below the lineage pickers, shared verbatim by the Modify tab.
 * `ownerId` is passed by the Modify tab only, where the row exists; without
 * it a picked cover waits in `pending_image_id` for the Add page to attach
 * once the entry is saved.
 */
export function HentaiFormBody({ f, u, sources, ownerId }) {
  const tagField = (key, placeholder) => (
    <MultiSelect
      options={getSourceValues(sources, HENTAI_SOURCES[key])}
      idleOptions={getIdleSourceValues(sources, HENTAI_SOURCES[key])}
      value={f[key]}
      onChange={(v) => u(key, v)}
      placeholder={placeholder}
      limit={null}
    />
  );
  const text = (key, label, placeholder, type = "text") => (
    <Field label={label}>
      <input
        className={inputCls}
        type={type}
        aria-label={label}
        value={f[key] ?? ""}
        onChange={(e) => u(key, e.target.value)}
        placeholder={placeholder}
      />
    </Field>
  );
  const num = (key, label, placeholder) => (
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
      <EntryNameFields f={f} u={u} prefix="hentai" label="Hentai" />

      <SectionHeader icon="fa-chart-bar" title="My Tracker" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
        {select("usefulness", "Usefulness", H_COMIC_USEFULNESS)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {num("ep_fin", "Episodes Finished", "0")}
        {num("ep_total", "Total Episodes", "2")}
        {text("time_fin", "Paused at", "14:35")}
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {select("airing_status", "Airing Status", AIRING_STATUSES)}
        <ReleaseDateInput
          label="Release Date"
          value={f.release_date}
          onChange={(v) => u("release_date", v)}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {select("source_material", "Source Material", HENTAI_SOURCE_MATERIALS)}
        {select("originality", "Originality", H_COMIC_ORIGINALITY)}
        <Field label="Series Number" hint="Its place in its series">
          <input
            className={inputCls}
            type="number"
            min="0"
            aria-label="Series Number"
            value={f.series_number ?? ""}
            onChange={(e) => u("series_number", e.target.value)}
            placeholder="1"
          />
        </Field>
      </div>

      <SectionHeader icon="fa-tags" title="Genres" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Genre Plot">{tagField("h_genre_plot", "Select or type genre...")}</Field>
        <Field label="Genre Appearance">
          {tagField("h_genre_appearance", "Select or type genre...")}
        </Field>
        <Field label="Genre Relation">
          {tagField("h_genre_relation", "Select or type genre...")}
        </Field>
      </div>
      <TagReplace
        mediaType="hentai"
        franchiseId={f.franchise_id}
        seriesId={f.series_id}
        entryId={ownerId}
        fields={["h_genre_plot", "h_genre_appearance", "h_genre_relation"]}
        what="genres"
        onChange={u}
      />

      <SectionHeader icon="fa-pen-nib" title="Production" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Studio">{tagField("studio", "Select studio...")}</Field>
        <Field label="Director">{tagField("director", "Select director...")}</Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Author" hint="The original work's writer">
          {tagField("author", "Select or type author...")}
        </Field>
      </div>

      {/* Saved through PUT /api/casting/hentai/{id} once the entry exists,
          by the Add and Modify pages - not part of the entry payload. */}
      <SectionHeader icon="fa-users" title="Cast" />
      <CastEditor
        mediaType="hentai"
        value={f.cast}
        onChange={(v) => u("cast", v)}
        franchiseId={f.franchise_id}
        malLink={f.mal_link}
        entryId={ownerId}
      />

      {/* Neither id is typed in: the write hook derives each from its link.
          Tenrai fills the airing status, release date, episode count and
          cover from the MAL link where they are blank, then AniDB fills what
          MAL left blank. */}
      <SectionHeader icon="fa-external-link-alt" title="Links & Sources" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {text("mal_link", "MAL Link", "https://myanimelist.net/anime/...", "url")}
        {text("anidb_link", "AniDB Link", "https://anidb.net/anime/...", "url")}
      </div>
      <SourcesEditor
        value={f.sources}
        onChange={(rows) => u("sources", rows)}
        mediaType="hentai"
        sources={sources}
      />

      <CoverRemarkFields f={f} u={u} ownerType="hentai" ownerId={ownerId} />
    </>
  );
}

/** The franchise and series pickers, shared by both hentai tabs. */
export function HentaiLineageFields({ f, u, allFranchises, seriesItemsForHentai, franchiseCollections }) {
  return (
    <FamilyLineageFields
      f={f}
      u={u}
      family={RESTRICTED_FAMILY}
      hint="Hentai, H-Comic and H-Game franchises only"
      allFranchises={allFranchises}
      seriesItems={seriesItemsForHentai}
      franchiseCollections={franchiseCollections}
    />
  );
}

export default function HentaiAddTab({
  franchiseCollections,
  htf,
  uht,
  allFranchises,
  allHentai,
  hentaiLoading,
  applyHentaiEntryAutofill,
  seriesItemsForHentai,
  sources,
}) {
  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6 space-y-2">
      <EntryAutofillSearch
        items={allHentai}
        names={(h) => [
          h.hentai_name_cn,
          h.hentai_name_en,
          h.hentai_name_alt,
          h.hentai_name_roman,
          h.hentai_name_jp,
        ]}
        title={(h) => getDisplayName(h, "hentai")}
        franchises={allFranchises}
        onPick={applyHentaiEntryAutofill}
        loading={hentaiLoading}
      />
      <SectionHeader icon="fa-tag" title="Titles & Naming" />
      <HentaiLineageFields
        f={htf}
        u={uht}
        allFranchises={allFranchises}
        seriesItemsForHentai={seriesItemsForHentai}
        franchiseCollections={franchiseCollections}
      />
      <HentaiFormBody f={htf} u={uht} sources={sources} />
    </div>
  );
}
