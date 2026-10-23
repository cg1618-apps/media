// Frontend: add tab page file for ComicAddTab.
//
// ComicFormBody and ComicLineageFields are the comic's one form, shared by
// this tab and ComicModifyTab (the Game pattern): the two pages differ only in
// the boxes above the form here, the Structured Notes below it there, and the
// `ownerId` Modify passes in.
import GenreLabelFields from "../../components/forms/GenreLabelFields";
import ComboBox from "../../components/forms/ComboBox";
import MultiSelect from "../../components/forms/MultiSelect";
import SourcesEditor from "../../components/forms/SourcesEditor";
import CoverRemarkFields from "../../components/forms/CoverRemarkFields";
import EntryFlags from "../../components/forms/EntryFlags";
import EntryNameFields from "../../components/forms/EntryNameFields";
import FamilyLineageFields from "../../components/forms/FamilyLineageFields";
import {
  Field,
  SectionHeader,
  inputCls,
  selectCls,
} from "../../components/forms/FormField";
import ReleaseDateInput from "../../components/forms/ReleaseDateInput";
import { getSourceValues, parseTypes } from "../../utils/media";
import {
  COMIC_TYPES,
  MANGA_SERIALIZATION_STATUSES as SERIALIZATION_STATUSES,
  MY_RATINGS,
  READING_STATUSES,
} from "../../config/fieldOptions";
import StatusOptions from "../../components/ui/StatusOptions";
import EntryAutofillSearch from "../../components/forms/EntryAutofillSearch";
import ExternalSearchBox from "../../components/forms/ExternalSearchBox";
import { endpoints } from "../../api/endpoints";

export { defaultComic } from "../../config/formFactories";

// `events` is an array in the form but MultiSelect speaks comma-separated
// strings, so it is converted at this boundary in both directions.
const eventsToString = (v) => (Array.isArray(v) ? v.join(", ") : v || "");
const eventsToArray = (s) =>
  (s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

const FLAGS = [
  ["read_next", "Read Next", "Add to Read Next list"],
  ["to_reread", "To Reread", "Mark for reread"],
];

// A comic sits in a Comic franchise, or an untyped one.
const acceptsComicFranchise = (type) =>
  !type || parseTypes(type).includes("Comic");

function SelectInput({ f, u, name, label, options }) {
  return (
    <Field label={label}>
      <select
        className={selectCls}
        value={f[name] ?? ""}
        onChange={(e) => u(name, e.target.value)}
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
}

/** The franchise and series pickers, shared by both comic tabs. */
export function ComicLineageFields({
  f,
  u,
  allFranchises,
  seriesItemsForComic,
  franchiseCollections,
}) {
  return (
    <FamilyLineageFields
      f={f}
      u={u}
      accepts={acceptsComicFranchise}
      allFranchises={allFranchises}
      seriesItems={seriesItemsForComic ?? []}
      franchiseCollections={franchiseCollections}
    />
  );
}

/**
 * Every field below the franchise/series pickers, shared verbatim by the
 * Modify tab. `ownerId` is the comic's id on Modify and absent on Add - the
 * only difference the body knows about (cover attach and tag replace).
 */
export function ComicFormBody({ f, u, sources, ownerId }) {
  // Free-text ComboBoxes over a source: the typed value is the value, so
  // `selectedId` is only set when it matches a known suggestion.
  const optionCombo = (source, key, placeholder) => {
    const options = getSourceValues(sources, source);
    return (
      <ComboBox
        items={options.map((v) => ({ id: v, label: v }))}
        selectedId={options.includes(f[key]) ? f[key] : null}
        inputText={f[key] || ""}
        onSelect={(id) => u(key, id)}
        onType={(text) => u(key, text)}
        onClear={() => u(key, "")}
        placeholder={placeholder}
        allowNew
      />
    );
  };

  return (
    <>
      <EntryNameFields
        f={f}
        u={u}
        prefix="comic"
        label="Comic"
        names={["cn", "en", "alt"]}
      />

      <SectionHeader icon="fa-chart-bar" title="My Tracker" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Reading Status">
          <select
            className={selectCls}
            value={f.reading_status ?? ""}
            onChange={(e) => u("reading_status", e.target.value)}
          >
            <StatusOptions statuses={READING_STATUSES} />
          </select>
        </Field>
        <SelectInput f={f} u={u} name="my_rating" label="My Rating" options={MY_RATINGS} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Issues Finished">
          <input
            className={inputCls}
            type="number"
            min="0"
            value={f.issue_fin ?? ""}
            onChange={(e) => u("issue_fin", e.target.value)}
            placeholder="0"
          />
        </Field>
        <Field label="Total Issues" hint="Leave blank if unknown or ongoing">
          <input
            className={inputCls}
            type="number"
            min="0"
            value={f.issue_total ?? ""}
            onChange={(e) => u("issue_total", e.target.value)}
            placeholder="0"
          />
        </Field>
      </div>
      <EntryFlags f={f} u={u} flags={FLAGS} />

      <SectionHeader icon="fa-info-circle" title="Information" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SelectInput f={f} u={u} name="comic_type" label="Comic Type" options={COMIC_TYPES} />
        <Field label="Volume Label" hint="e.g. Vol. 5 (2018)">
          <input
            className={inputCls}
            value={f.volume_label ?? ""}
            onChange={(e) => u("volume_label", e.target.value)}
            placeholder="Vol. 5 (2018)"
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SelectInput
          f={f}
          u={u}
          name="serialization_status"
          label="Serialization Status"
          options={SERIALIZATION_STATUSES}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Continuity">
          {optionCombo(
            { kind: "option", category: "Comic Continuity", scope: "comic" },
            "continuity",
            "e.g. Earth-616",
          )}
        </Field>
        <Field label="Era">
          {optionCombo(
            { kind: "option", category: "Comic Era", scope: "comic" },
            "era",
            "e.g. Modern",
          )}
        </Field>
      </div>
      <Field label="Events" hint="Marvel events this run is part of">
        <MultiSelect
          options={getSourceValues(sources, {
            kind: "option",
            category: "Comic Event",
            scope: "comic",
          })}
          value={eventsToString(f.events)}
          onChange={(v) => u("events", eventsToArray(v))}
          placeholder="Select or type event..."
        />
      </Field>

      <GenreLabelFields
        mediaType="comic"
        values={f}
        onChange={u}
        sources={sources}
        franchiseId={f.franchise_id}
        seriesId={f.series_id}
        entryId={ownerId}
      />

      <SectionHeader icon="fa-pen-nib" title="Production" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Writer">
          <MultiSelect
            options={getSourceValues(sources, {
              kind: "person",
              role: "author",
              scope: "comic",
            })}
            value={f.writer ?? ""}
            onChange={(v) => u("writer", v)}
            placeholder="Select or type writer..."
          />
        </Field>
        <Field label="Artist">
          <MultiSelect
            options={getSourceValues(sources, {
              kind: "person",
              role: "illustrator",
              scope: "comic",
            })}
            value={f.artist ?? ""}
            onChange={(v) => u("artist", v)}
            placeholder="Select or type artist..."
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* One publisher field, not two: the separate "Publisher TW" was
            defined and never used, and both vocabularies behind them are
            retired - this is a Publisher row now. */}
        <Field label="Publisher">
          {optionCombo(
            { kind: "publisher", scope: "comic" },
            "publisher",
            "e.g. Marvel",
          )}
        </Field>
        <Field label="Imprint">
          {optionCombo(
            { kind: "option", category: "Comic Imprint", scope: "comic" },
            "imprint",
            "e.g. Ultimate",
          )}
        </Field>
      </div>

      <SectionHeader icon="fa-link" title="Read Order" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Read Order" hint="e.g. 1, 1.5, 2">
          <input
            className={inputCls}
            type="number"
            step="any"
            min="0"
            value={f.read_order ?? ""}
            onChange={(e) => u("read_order", e.target.value)}
            placeholder="1"
          />
        </Field>
      </div>

      <SectionHeader icon="fa-external-link-alt" title="Links & Sources" />
      {/* The id travels as typed on both pages - the save path never derives
          it from the link - so a link-less comic can still carry one. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Comic Vine ID" hint="The volume's Comic Vine id">
          <input
            className={inputCls}
            type="number"
            min="0"
            aria-label="Comic Vine ID"
            value={f.comicvine_id ?? ""}
            onChange={(e) => u("comicvine_id", e.target.value)}
            placeholder="2127"
          />
        </Field>
        <Field
          label="Comic Vine Link"
          hint="Volume URL — Fill Comic pulls publisher, credits, issue count and the cover from it"
        >
          <input
            className={inputCls}
            aria-label="Comic Vine Link"
            value={f.comicvine_link ?? ""}
            onChange={(e) => u("comicvine_link", e.target.value)}
            placeholder="https://comicvine.gamespot.com/.../4050-2127/"
          />
        </Field>
      </div>
      <SourcesEditor
        value={f.sources}
        onChange={(rows) => u("sources", rows)}
        mediaType="comic"
        sources={sources}
      />

      <CoverRemarkFields f={f} u={u} ownerType="comic" ownerId={ownerId} />
    </>
  );
}

export default function ComicAddTab({
  franchiseCollections,
  cmf,
  ucm,
  allComics,
  comicsLoading = false,
  applyComicEntryAutofill,
  applyComicVinePick,
  allFranchises,
  seriesItemsForComic,
  sources,
}) {
  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6 space-y-2">
      <EntryAutofillSearch
        items={allComics}
        names={(c) => [c.comic_name_en, c.comic_name_cn, c.comic_name_alt]}
        title={(c) => c.comic_name_en || c.comic_name_cn}
        franchises={allFranchises}
        badge={(c) => c.comic_type}
        onPick={applyComicEntryAutofill}
        loading={comicsLoading}
      />
      <ExternalSearchBox
        source="Comic Vine"
        searchUrl={endpoints.comic.searchComicVine}
        onPick={applyComicVinePick}
        submitOnEnter
        hint="Searches on Enter, not as you type: Comic Vine allows 200 requests an hour."
      />
      <SectionHeader icon="fa-tag" title="Titles & Naming" />
      <ComicLineageFields
        f={cmf}
        u={ucm}
        allFranchises={allFranchises}
        seriesItemsForComic={seriesItemsForComic}
        franchiseCollections={franchiseCollections}
      />
      <ComicFormBody f={cmf} u={ucm} sources={sources} />
    </div>
  );
}
