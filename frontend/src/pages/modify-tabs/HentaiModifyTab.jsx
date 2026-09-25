// Frontend: modify tab page file for HentaiModifyTab.
//
// Renders HentaiAddTab's lineage pickers and field body, so the Add and
// Modify forms of the type are one definition. Modify adds
// the ribbon above the form and the entry's Structured Notes below it.
import { SectionHeader } from "../../components/forms/FormField";
import HentaiNotes from "../detail/HentaiNotes";
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
      <SectionHeader icon="fa-book-open" title="Structured Notes" />
      {/* `remark` is hidden here: the form's Remark field edits the same
          singleton note row, and two editors for one row overwrite each
          other on Save Changes. */}
      <HentaiNotes
        hentai={editingItem ?? {}}
        isAdmin={true}
        hideSections={["remark"]}
      />
    </>
  );
}
