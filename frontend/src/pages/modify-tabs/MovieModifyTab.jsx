// Frontend: modify tab page file for MovieModifyTab.
//
// MovieAddTab exports the movie form body and lineage pickers, so the two
// tabs share one definition and cannot drift. Modify passes the movie's id as
// `ownerId` and adds the entry's Structured Notes below the form; the
// franchise ribbon above the card is Modify.jsx's.
import { SectionHeader } from "../../components/forms/FormField";
import { MovieFormBody, MovieLineageFields } from "../add-tabs/MovieAddTab";
import MovieNotes from "../detail/MovieNotes";

export default function MovieModifyTab({
  franchiseCollections,
  mmf,
  umm,
  allFranchises,
  seriesItemsForMovie,
  editingItem,
  sources,
}) {
  return (
    <>
      <SectionHeader icon="fa-tag" title="Titles & Naming" />
      <MovieLineageFields
        f={mmf}
        u={umm}
        allFranchises={allFranchises}
        seriesItemsForMovie={seriesItemsForMovie}
        franchiseCollections={franchiseCollections}
      />
      <MovieFormBody f={mmf} u={umm} sources={sources} ownerId={editingItem?.system_id} />

      <SectionHeader icon="fa-book-open" title="Structured Notes" />
      {/* `remark` is hidden here: the form's Remark field edits the same
          singleton note row, and two editors for one row overwrite each
          other on Save Changes. */}
      <MovieNotes
        key={editingItem?.system_id}
        movie={{ system_id: editingItem?.system_id }}
        isAdmin={true}
        hideSections={["remark"]}
      />
    </>
  );
}
