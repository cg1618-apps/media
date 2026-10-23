// Frontend: modify tab page file for ComicModifyTab.
//
// ComicAddTab exports the comic's form body and lineage pickers, so the two
// tabs share one definition and cannot drift (the Game pattern). Modify adds
// the entry's Structured Notes below the form; the franchise ribbon is
// Modify.jsx's, above the editor card.
import { SectionHeader } from "../../components/forms/FormField";
import { ComicFormBody, ComicLineageFields } from "../add-tabs/ComicAddTab";
import ComicNotes from "../detail/ComicNotes";

export default function ComicModifyTab({
  franchiseCollections,
  ccmf,
  ucm,
  allFranchises,
  seriesItemsForComic,
  editingItem,
  sources,
}) {
  return (
    <>
      <SectionHeader icon="fa-tag" title="Titles & Naming" />
      <ComicLineageFields
        f={ccmf}
        u={ucm}
        allFranchises={allFranchises}
        seriesItemsForComic={seriesItemsForComic}
        franchiseCollections={franchiseCollections}
      />
      <ComicFormBody
        f={ccmf}
        u={ucm}
        sources={sources}
        ownerId={editingItem?.system_id}
      />
      <SectionHeader icon="fa-book-open" title="Structured Notes" />
      {/* `remark` is hidden here: the form's Remark field edits the same
          singleton note row, and two editors for one row overwrite each
          other on Save Changes. */}
      <ComicNotes
        comic={editingItem ?? {}}
        isAdmin={true}
        hideSections={["remark"]}
      />
    </>
  );
}
