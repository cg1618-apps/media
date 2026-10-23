// Frontend: modify tab page file for AnimeMovieModifyTab.
//
// AnimeMovieAddTab exports the form body and franchise picker, so the two
// tabs share one definition and cannot drift. Modify hands the body the
// entry's id and adds the entry's Structured Notes below it.
import { SectionHeader } from "../../components/forms/FormField";
import {
  AnimeMovieFormBody,
  AnimeMovieLineageFields,
} from "../add-tabs/AnimeMovieAddTab";
import AnimeMovieNotes from "../detail/AnimeMovieNotes";

export default function AnimeMovieModifyTab({
  franchiseCollections,
  amf,
  uam,
  allFranchises,
  sources,
  editingItem,
}) {
  const ownerId = editingItem?.system_id;
  return (
    <>
      <SectionHeader icon="fa-tag" title="Titles & Naming" />
      <AnimeMovieLineageFields
        f={amf}
        u={uam}
        allFranchises={allFranchises}
        franchiseCollections={franchiseCollections}
      />
      <AnimeMovieFormBody f={amf} u={uam} sources={sources} ownerId={ownerId} />

      <SectionHeader icon="fa-book-open" title="Structured Notes" />
      {/* `remark` is hidden here: the form's Remark field edits the same
          singleton note row, and two editors for one row overwrite each
          other on Save Changes. */}
      <AnimeMovieNotes
        key={ownerId}
        movie={editingItem ?? {}}
        isAdmin={true}
        hideSections={["remark"]}
      />
    </>
  );
}
