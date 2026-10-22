// Frontend: modify tab page file for TvShowModifyTab.
//
// TvShowAddTab exports the TV form body and lineage pickers, so the two tabs
// share one definition and cannot drift. Modify passes the show's id as
// `ownerId` and adds the entry's Structured Notes below the form; the
// franchise ribbon above the card is Modify.jsx's.
import { SectionHeader } from "../../components/forms/FormField";
import { TvShowFormBody, TvShowLineageFields } from "../add-tabs/TvShowAddTab";
import TVShowNotes from "../detail/TVShowNotes";

export default function TvShowModifyTab({
  franchiseCollections,
  tvmf,
  utv,
  allFranchises,
  seriesItemsForTvShow,
  editingItem,
  sources,
}) {
  return (
    <>
      <SectionHeader icon="fa-tag" title="Titles & Naming" />
      <TvShowLineageFields
        f={tvmf}
        u={utv}
        allFranchises={allFranchises}
        seriesItemsForTvShow={seriesItemsForTvShow}
        franchiseCollections={franchiseCollections}
      />
      <TvShowFormBody f={tvmf} u={utv} sources={sources} ownerId={editingItem?.system_id} />

      <SectionHeader icon="fa-book-open" title="Structured Notes" />
      {/* `remark` is hidden here: the form's Remark field edits the same
          singleton note row, and two editors for one row overwrite each
          other on Save Changes. */}
      <TVShowNotes
        key={editingItem?.system_id}
        show={{ system_id: editingItem?.system_id }}
        isAdmin={true}
        hideSections={["remark"]}
      />
    </>
  );
}
