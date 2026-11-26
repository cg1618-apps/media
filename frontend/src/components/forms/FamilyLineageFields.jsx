// Frontend: the franchise and series pickers every entry form opens with,
// side by side in one row.
//
// Which franchises are offered is the caller's rule, given one of two ways:
//
//   - `family` - a gated type's entry sits only in a franchise of its own
//     FAMILY (lib/gatedTypes.js inFranchiseFamily): the server refuses (422)
//     any other, so the picker offers no other. H-Comic, Hentai and H-Game
//     are one family (`restricted`), so an h-comic and its hentai adaptation
//     can share a franchise the way a manga and its anime do, and one doujin
//     franchise can hold all three.
//   - `accepts(franchise_type)` - any other rule, as a predicate over the
//     franchise's comma-joined `franchise_type` (null when untyped). A
//     mainstream type passes its own franchise type or an untyped one - anime
//     `Anime`, anime movie `Anime Movie`, book `Book`, `Anime` or `Manga`.
//
// With neither, every franchise is offered. The franchise already chosen is
// offered whatever the rule, so an entry saved under a franchise the rule now
// excludes still shows it on Modify rather than a blank picker.
//
// The Series picker follows the same rule, since a series names its parent:
// `seriesItems` (lib/seriesPickerItems.js) carry their parent's id as
// `franchiseId`, and the picker offers the picked franchise's series, or,
// before a franchise is picked, the series under a franchise it offers. The
// series already chosen is offered whatever the rule, as above.
//
// Both pickers rank what is typed as exact, then prefix, then contains
// (ComboBox rankMatches), each rank in the order the items came in - which for
// the admin pages is busiest first (hooks/useEntryLists.js). So the best name
// match leads, and among equal matches the franchise with the most entries.
//
// The Series picker renders only when `seriesItems` is given - anime movie
// has no series. Typing a name that matches nothing creates a franchise (or
// series) of the caller's own type on save; the page does that, not this
// component.
import ComboBox from "./ComboBox";
import { CollectionNote, Field } from "./FormField";
import { inFranchiseFamily } from "../../lib/gatedTypes";
import { getDisplayName } from "../../utils/media";

export default function FamilyLineageFields({
  f,
  u,
  family,
  accepts,
  hint,
  allFranchises = [],
  seriesItems,
  franchiseCollections,
}) {
  const offers =
    accepts ?? (family ? (type) => inFranchiseFamily(type, family) : () => true);
  const hasSeries = seriesItems !== undefined && seriesItems !== null;

  const offeredFranchises = allFranchises.filter(
    (fr) => fr.system_id === f.franchise_id || offers(fr.franchise_type),
  );
  const offeredFranchiseIds = new Set(offeredFranchises.map((fr) => fr.system_id));
  const offeredSeries = hasSeries
    ? seriesItems.filter(
        (s) =>
          s.id === f.series_id ||
          (f.franchise_id
            ? s.franchiseId === f.franchise_id
            : offeredFranchiseIds.has(s.franchiseId)),
      )
    : [];

  const franchiseItems = offeredFranchises
    .map((fr) => ({
      id: fr.system_id,
      label: getDisplayName(fr, "franchise"),
      searchText: [
        fr.franchise_name_en,
        fr.franchise_name_cn,
        fr.franchise_name_roman,
        fr.franchise_name_jp,
        fr.franchise_name_alt,
      ]
        .filter(Boolean)
        .join(" "),
    }));

  // Picking or retyping the franchise drops the series: a series names its
  // parent, so one chosen under the old franchise would not belong. A form
  // with no series picker has no series keys, and none are written.
  const setFranchise = (id, text) => {
    u("franchise_id", id);
    u("franchise_text", text);
    if (hasSeries) {
      u("series_id", null);
      u("series_text", "");
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="Franchise" hint={hint}>
        <ComboBox
          items={franchiseItems}
          selectedId={f.franchise_id}
          inputText={f.franchise_text}
          onSelect={(id, label) => setFranchise(id, label)}
          onType={(t) => setFranchise(null, t)}
          onClear={() => setFranchise(null, "")}
          placeholder="Search or type new franchise..."
          ariaLabel="Franchise"
          allowNew
          rankMatches
        />
        <CollectionNote franchiseId={f.franchise_id} franchiseCollections={franchiseCollections} />
      </Field>
      {hasSeries && (
        <Field label="Series">
          <ComboBox
            items={offeredSeries}
            selectedId={f.series_id}
            inputText={f.series_text}
            onSelect={(id, label) => {
              u("series_id", id);
              u("series_text", label);
            }}
            onType={(t) => {
              u("series_text", t);
              u("series_id", null);
            }}
            onClear={() => {
              u("series_id", null);
              u("series_text", "");
            }}
            placeholder="Search or type new series..."
            ariaLabel="Series"
            allowNew
            rankMatches
          />
        </Field>
      )}
    </div>
  );
}
