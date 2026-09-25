// Frontend: modify tab page file for HComicModifyTab.
//
// Renders HComicAddTab's region field, lineage pickers and field body, so the
// Add and Modify forms of the type are one definition. Modify adds
// the ribbon above the form and the entry's Structured Notes below it.
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
  ribbonSection,
  sources,
}) {
  return (
    <>
      {ribbonSection}

      <SectionHeader icon="fa-book" title="Titles & Naming" />
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
