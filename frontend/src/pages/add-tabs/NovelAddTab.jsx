// Frontend: add tab page file for NovelAddTab.
//
// NovelFormBody and NovelLineageFields are the novel's one form, shared by
// this tab and NovelModifyTab (the Game pattern): the two pages differ only in
// the boxes above the form here, the Structured Notes below it there, and the
// `ownerId` Modify passes in.
import GenreLabelFields from "../../components/forms/GenreLabelFields";
import NovelUnitsEditor from "../../components/forms/NovelUnitsEditor";
import {
  countsChapters,
  countsVolumes,
  progressDisplayOptions,
} from "../../lib/novelUnits";
import ComboBox from "../../components/forms/ComboBox";
import MultiSelect from "../../components/forms/MultiSelect";
import CastEditor from "../../components/forms/CastEditor";
import SourcesEditor from "../../components/forms/SourcesEditor";
import CoverRemarkFields from "../../components/forms/CoverRemarkFields";
import EntryFlags from "../../components/forms/EntryFlags";
import EntryNameFields from "../../components/forms/EntryNameFields";
import FamilyLineageFields from "../../components/forms/FamilyLineageFields";
import MalAnilistScores from "../../components/forms/MalAnilistScores";
import {
  Field,
  SectionHeader,
  inputCls,
  selectCls,
} from "../../components/forms/FormField";
import ReleaseDateInput from "../../components/forms/ReleaseDateInput";
import { getSourceValues, parseTypes } from "../../utils/media";
import {
  IS_MAIN,
  MY_RATINGS,
  NOVEL_REGIONS,
  NOVEL_SERIALIZATION_STATUSES as SERIALIZATION_STATUSES,
  NOVEL_TYPES,
  READING_STATUSES,
  withLegacyProgressDisplay,
} from "../../config/fieldOptions";
import StatusOptions from "../../components/ui/StatusOptions";
import EntryAutofillSearch from "../../components/forms/EntryAutofillSearch";
import ExternalSearchBox from "../../components/forms/ExternalSearchBox";
import { endpoints } from "../../api/endpoints";

export { defaultNovel } from "../../config/formFactories";

const FLAGS = [
  ["read_next", "Read Next", "Add to Read Next list"],
  ["to_reread", "To Reread", "Mark for reread"],
];

// A novel sits in a Novel or ACG franchise, or an untyped one.
const acceptsNovelFranchise = (type) =>
  !type ||
  parseTypes(type).includes("Novel") ||
  parseTypes(type).includes("ACG");

function NumberInput({ f, u, name, label, hint, placeholder = "0" }) {
  return (
    <Field label={label} hint={hint}>
      <input
        className={inputCls}
        type="number"
        step="any"
        min="0"
        value={f[name] ?? ""}
        onChange={(e) => u(name, e.target.value)}
        placeholder={placeholder}
      />
    </Field>
  );
}

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

/** The franchise and series pickers, shared by both novel tabs. */
export function NovelLineageFields({
  f,
  u,
  allFranchises,
  seriesItemsForNovel,
  franchiseCollections,
}) {
  return (
    <FamilyLineageFields
      f={f}
      u={u}
      accepts={acceptsNovelFranchise}
      allFranchises={allFranchises}
      seriesItems={seriesItemsForNovel ?? []}
      franchiseCollections={franchiseCollections}
    />
  );
}

/**
 * Every field below the franchise/series pickers, shared verbatim by the
 * Modify tab. `ownerId` is the novel's id on Modify and absent on Add - the
 * only difference the body knows about (cover attach, cast and tag replace).
 */
export function NovelFormBody({ f, u, sources, ownerId }) {
  const publisherOptions = getSourceValues(sources, {
    kind: "publisher",
    scope: "novel",
  });
  const publisherItems = publisherOptions.map((v) => ({ id: v, label: v }));
  const chapters = countsChapters(f);
  const volumes = countsVolumes(f);

  return (
    <>
      <EntryNameFields
        f={f}
        u={u}
        prefix="novel"
        label="Novel"
        names={["cn", "en", "roman", "jp", "alt"]}
        placeholders={{ roman: "Romanized title" }}
      />

      <MalAnilistScores f={f} u={u} />

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
        <Field label="Progress Display" hint="Which tracker to show on the card">
          <select
            className={selectCls}
            value={f.progress_display ?? ""}
            onChange={(e) => u("progress_display", e.target.value)}
            aria-label="Progress display"
          >
            {withLegacyProgressDisplay(
              progressDisplayOptions(f),
              f.progress_display,
            ).map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {/* Arc and chapter counters exist only for the types that count them.
          A Light Novel or a Novel counts volumes, and the server clears these
          columns on save, so offering the inputs would invite an edit that is
          discarded. Follows the Type dropdown live. */}
      {chapters && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <NumberInput f={f} u={u} name="ch_fin" label="Ch Finished" />
            <NumberInput f={f} u={u} name="ch_total" label="Ch Total" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <NumberInput f={f} u={u} name="arc_fin" label="Arc Finished" />
            <NumberInput f={f} u={u} name="arc_total" label="Arc Total" />
          </div>
        </>
      )}
      {/* Volume counters. Hidden for Web, which is read in chapters - the
          columns keep whatever they hold (a later print run, or a type change
          back) but are not edited from here. */}
      {volumes && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <NumberInput f={f} u={u} name="vol_fin" label="Vol Finished" />
          <NumberInput
            f={f}
            u={u}
            name="vol_total_original"
            label="Total Volumes (JP/KR)"
          />
          <NumberInput f={f} u={u} name="vol_total_tw" label="Vol Total (TW)" />
        </div>
      )}
      <EntryFlags f={f} u={u} flags={FLAGS} />

      <SectionHeader icon="fa-info-circle" title="Information" />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SelectInput f={f} u={u} name="region" label="Region" options={NOVEL_REGIONS} />
        <SelectInput f={f} u={u} name="type" label="Type" options={NOVEL_TYPES} />
        <SelectInput f={f} u={u} name="is_main" label="Is Main" options={IS_MAIN} />
        <Field label="Version">
          <input
            className={inputCls}
            value={f.version ?? ""}
            onChange={(e) => u("version", e.target.value)}
            placeholder="e.g. 陸版"
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

      <GenreLabelFields
        mediaType="novel"
        values={f}
        onChange={u}
        sources={sources}
        franchiseId={f.franchise_id}
        seriesId={f.series_id}
        entryId={ownerId}
      />

      <SectionHeader icon="fa-pen-nib" title="Production" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Author">
          <MultiSelect
            options={getSourceValues(sources, {
              kind: "person",
              role: "author",
              scope: "novel",
            })}
            value={f.author ?? ""}
            onChange={(v) => u("author", v)}
            placeholder="Select or type author..."
          />
        </Field>
        <Field label="Illustrator">
          <MultiSelect
            options={getSourceValues(sources, {
              kind: "person",
              role: "illustrator",
              scope: "novel",
            })}
            value={f.illustrator ?? ""}
            onChange={(v) => u("illustrator", v)}
            placeholder="Select or type illustrator..."
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Publisher TW">
          <ComboBox
            items={publisherItems}
            selectedId={
              publisherOptions.includes(f.publisher_tw) ? f.publisher_tw : null
            }
            inputText={f.publisher_tw || ""}
            onSelect={(id) => u("publisher_tw", id)}
            onType={(text) => u("publisher_tw", text)}
            onClear={() => u("publisher_tw", "")}
            placeholder="e.g. 台灣角川"
            allowNew
          />
        </Field>
      </div>

      {/* Cast: character/role rows (no seiyuu column - nobody voices anyone
          in a novel), saved through PUT /api/casting/novel/{id} separately
          from the entry's own payload - on Add once the entry exists. */}
      <SectionHeader icon="fa-users" title="Cast" />
      <CastEditor
        mediaType="novel"
        franchiseId={f.franchise_id}
        malLink={f.mal_link}
        entryId={ownerId}
        value={f.cast}
        onChange={(v) => u("cast", v)}
      />

      <SectionHeader icon="fa-link" title="Read Order" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <NumberInput
          f={f}
          u={u}
          name="read_order"
          label="Read Order"
          hint="e.g. 1, 1.5, 2"
          placeholder="1"
        />
      </div>
      <SectionHeader icon="fa-book-open" title="Units" />
      <NovelUnitsEditor
        items={f.units}
        novelType={f.type}
        onChange={(val) => u("units", val)}
      />

      <SectionHeader icon="fa-external-link-alt" title="Links & Sources" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="MAL ID">
          <input
            className={inputCls}
            type="number"
            min="0"
            value={f.mal_id ?? ""}
            onChange={(e) => u("mal_id", e.target.value)}
            placeholder="12345"
          />
        </Field>
        <Field label="MAL Link">
          <input
            className={inputCls}
            type="url"
            value={f.mal_link ?? ""}
            onChange={(e) => u("mal_link", e.target.value)}
            placeholder="https://myanimelist.net/manga/..."
          />
        </Field>
      </div>
      {/* The Open Library work id is editable beside its link: the link wins
          whenever it is set (Fill re-derives the id from it), but a stale id
          left by a cleared link can only be removed here. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Open Library ID">
          <input
            className={inputCls}
            value={f.openlibrary_id ?? ""}
            onChange={(e) => u("openlibrary_id", e.target.value)}
            placeholder="OL5738148W"
          />
        </Field>
        <Field label="Open Library Link">
          <input
            className={inputCls}
            type="url"
            value={f.openlibrary_link ?? ""}
            onChange={(e) => u("openlibrary_link", e.target.value)}
            placeholder="https://openlibrary.org/works/OL..."
          />
        </Field>
      </div>
      <Field label="Serialization Platform">
        <MultiSelect
          options={getSourceValues(sources, {
            kind: "option",
            category: "Serialization Platform",
            scope: "novel",
          })}
          value={f.serialization_platform ?? ""}
          onChange={(v) => u("serialization_platform", v)}
          placeholder="e.g. 小説家になろう"
        />
      </Field>
      <SourcesEditor
        value={f.sources}
        onChange={(rows) => u("sources", rows)}
        mediaType="novel"
        sources={sources}
      />

      <CoverRemarkFields f={f} u={u} ownerType="novel" ownerId={ownerId} />
    </>
  );
}

export default function NovelAddTab({
  franchiseCollections,
  nvf,
  unv,
  allNovels,
  novelsLoading = false,
  applyNovelEntryAutofill,
  applyMalPick,
  applyOpenLibraryPick,
  allFranchises,
  seriesItemsForNovel,
  sources,
}) {
  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6 space-y-2">
      <EntryAutofillSearch
        items={allNovels}
        names={(n) => [
          n.novel_name_cn,
          n.novel_name_en,
          n.novel_name_roman,
          n.novel_name_jp,
          n.novel_name_alt,
        ]}
        title={(n) => n.novel_name_cn || n.novel_name_en}
        franchises={allFranchises}
        badge={(n) => n.region}
        onPick={applyNovelEntryAutofill}
        loading={novelsLoading}
      />
      <ExternalSearchBox
        source="MAL"
        searchUrl={endpoints.novel.searchMal}
        onPick={applyMalPick}
      />
      <ExternalSearchBox
        source="Open Library"
        searchUrl={endpoints.novel.searchOpenLibrary}
        onPick={applyOpenLibraryPick}
      />
      <SectionHeader icon="fa-tag" title="Titles & Naming" />
      <NovelLineageFields
        f={nvf}
        u={unv}
        allFranchises={allFranchises}
        seriesItemsForNovel={seriesItemsForNovel}
        franchiseCollections={franchiseCollections}
      />
      <NovelFormBody f={nvf} u={unv} sources={sources} />
    </div>
  );
}
