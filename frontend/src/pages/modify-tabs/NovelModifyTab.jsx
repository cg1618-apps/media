// Frontend: modify tab page file for NovelModifyTab.
//
// NovelAddTab exports the novel's form body and lineage pickers, so the two
// tabs share one definition and cannot drift (the Game pattern). Modify adds
// the entry's Structured Notes below the form; the franchise ribbon is
// Modify.jsx's, above the editor card.
import { SectionHeader } from "../../components/forms/FormField";
import { NovelFormBody, NovelLineageFields } from "../add-tabs/NovelAddTab";
import NovelNotes from "../detail/NovelNotes";

export default function NovelModifyTab({
  franchiseCollections,
  cnvf,
  unv,
  allFranchises,
  seriesItemsForNovel,
  editingItem,
  sources,
}) {
  return (
    <>
      <SectionHeader icon="fa-tag" title="Titles & Naming" />
      <NovelLineageFields
        f={cnvf}
        u={unv}
        allFranchises={allFranchises}
        seriesItemsForNovel={seriesItemsForNovel}
        franchiseCollections={franchiseCollections}
      />
      <NovelFormBody
        f={cnvf}
        u={unv}
        sources={sources}
        ownerId={editingItem?.system_id}
      />
      <SectionHeader icon="fa-book-open" title="Structured Notes" />
      {/* `remark` is hidden here: the form's Remark field edits the same
          singleton note row, and two editors for one row overwrite each
          other on Save Changes. */}
      <NovelNotes
        novel={editingItem ?? {}}
        isAdmin={true}
        hideSections={["remark"]}
      />
    </>
  );
}
