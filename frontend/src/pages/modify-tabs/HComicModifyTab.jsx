// Frontend: modify tab page file for HComicModifyTab.
//
// Renders HComicAddTab's region field, lineage pickers and field body, so the
// Add and Modify forms of the type are one definition. Modify hands the body
// the entry's id and adds the entry's Structured Notes below it; the franchise
// ribbon above the card is Modify.jsx's. The region field takes the plain
// updater here - only Add re-suggests restricted sources on a region change.
import { SectionHeader } from "../../components/forms/FormField";
import HComicNotes from "../detail/HComicNotes";
import { HComicFormBody, HComicLineageFields, HComicRegionField } from "../add-tabs/HComicAddTab";

export default function HComicModifyTab({
  franchiseCollections,
  chcf,
  uhc,
  allFranchises,
  seriesItemsForHComic,
  editingItem,
  sources,
}) {
  return (
    <>
      <SectionHeader icon="fa-tag" title="Titles & Naming" />
      <HComicRegionField f={chcf} u={uhc} />
      <HComicLineageFields
        f={chcf}
        u={uhc}
        allFranchises={allFranchises}
        seriesItemsForHComic={seriesItemsForHComic}
        franchiseCollections={franchiseCollections}
      />
      <HComicFormBody f={chcf} u={uhc} sources={sources} ownerId={editingItem?.system_id} />
      <SectionHeader icon="fa-book-open" title="Structured Notes" />
      {/* `remark` is hidden here: the form's Remark field edits the same
          singleton note row, and two editors for one row overwrite each
          other on Save Changes. */}
      <HComicNotes
        hComic={editingItem ?? {}}
        isAdmin={true}
        hideSections={["remark"]}
      />
    </>
  );
}
