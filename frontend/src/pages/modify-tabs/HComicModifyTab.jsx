// Frontend: modify tab page file for HComicModifyTab.
//
// Renders HComicAddTab's region field, lineage pickers and field body, so the
// Add and Modify forms of the type are one definition. The only difference is
// the ribbon Modify renders above the form.
import { SectionHeader } from "../../components/forms/FormField";
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
    </>
  );
}
