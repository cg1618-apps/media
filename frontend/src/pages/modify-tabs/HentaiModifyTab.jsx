// Frontend: modify tab page file for HentaiModifyTab.
//
// Renders HentaiAddTab's lineage pickers and field body, so the Add and
// Modify forms of the type are one definition. The only difference is the
// ribbon Modify renders above the form.
import { SectionHeader } from "../../components/forms/FormField";
import { HentaiFormBody, HentaiLineageFields } from "../add-tabs/HentaiAddTab";

export default function HentaiModifyTab({
  franchiseCollections,
  chtf,
  uht,
  allFranchises,
  seriesItemsForHentai,
  editingItem,
  ribbonSection,
  sources,
}) {
  return (
    <>
      {ribbonSection}

      <SectionHeader icon="fa-tv" title="Titles & Naming" />
      <HentaiLineageFields
        f={chtf}
        u={uht}
        allFranchises={allFranchises}
        seriesItemsForHentai={seriesItemsForHentai}
        franchiseCollections={franchiseCollections}
      />
      <HentaiFormBody f={chtf} u={uht} sources={sources} ownerId={editingItem?.system_id} />
    </>
  );
}
