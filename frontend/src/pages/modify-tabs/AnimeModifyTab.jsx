// Frontend: modify tab page file for AnimeModifyTab.
//
// AnimeAddTab exports the form body and lineage pickers, so the two tabs share
// one definition and cannot drift. Modify hands the body the entry's id and
// adds the entry's Structured Notes below it.
import { SectionHeader } from "../../components/forms/FormField";
import { AnimeFormBody, AnimeLineageFields } from "../add-tabs/AnimeAddTab";
import AnimeNotes from "../detail/AnimeNotes";

export default function AnimeModifyTab({
  franchiseCollections,
  af,
  ua,
  allFranchises,
  seriesItemsForAnime,
  sources,
  editingItem,
}) {
  const ownerId = editingItem?.system_id;
  return (
    <>
      <SectionHeader icon="fa-tag" title="Titles & Naming" />
      <AnimeLineageFields
        f={af}
        u={ua}
        allFranchises={allFranchises}
        seriesItemsForAnime={seriesItemsForAnime}
        franchiseCollections={franchiseCollections}
      />
      <AnimeFormBody f={af} u={ua} sources={sources} ownerId={ownerId} />

      <SectionHeader icon="fa-book-open" title="Structured Notes" />
      {/* `remark` is hidden here: the form's Remark field edits the same
          singleton note row, and two editors for one row overwrite each
          other on Save Changes. */}
      <AnimeNotes
        key={ownerId}
        anime={editingItem ?? {}}
        isAdmin={true}
        hideSections={["remark"]}
      />
    </>
  );
}
