// Frontend: modify tab page file for MangaModifyTab.
//
// MangaAddTab exports the form body and lineage pickers, so the two tabs share
// one definition and cannot drift. Modify hands the body the entry's id and
// adds the entry's Structured Notes below it.
import { SectionHeader } from "../../components/forms/FormField";
import { MangaFormBody, MangaLineageFields } from "../add-tabs/MangaAddTab";
import MangaNotes from "../detail/MangaNotes";

export default function MangaModifyTab({
  franchiseCollections,
  cmgf,
  umg,
  allFranchises,
  seriesItemsForManga,
  editingItem,
  sources,
}) {
  const ownerId = editingItem?.system_id;
  return (
    <>
      <SectionHeader icon="fa-tag" title="Titles & Naming" />
      <MangaLineageFields
        f={cmgf}
        u={umg}
        allFranchises={allFranchises}
        seriesItemsForManga={seriesItemsForManga}
        franchiseCollections={franchiseCollections}
      />
      <MangaFormBody f={cmgf} u={umg} sources={sources} ownerId={ownerId} />

      <SectionHeader icon="fa-book-open" title="Structured Notes" />
      {/* `remark` is hidden here: the form's Remark field edits the same
          singleton note row, and two editors for one row overwrite each
          other on Save Changes. */}
      <MangaNotes
        key={ownerId}
        manga={editingItem ?? {}}
        isAdmin={true}
        hideSections={["remark"]}
      />
    </>
  );
}
