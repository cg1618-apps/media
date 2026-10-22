// Frontend: modify tab page file for GameModifyTab.
//
// GameAddTab exports its field body and lineage pickers, so the Add and
// Modify tabs share one definition and cannot drift. Modify hands the body the
// entry's id and adds the entry's Structured Notes below it; the franchise
// ribbon above the card is Modify.jsx's.
import { SectionHeader } from "../../components/forms/FormField";
import { GameFormBody, GameLineageFields } from "../add-tabs/GameAddTab";
import GameNotes from "../detail/GameNotes";

export default function GameModifyTab({
  franchiseCollections,
  cgmf,
  ugm,
  allFranchises,
  allGames,
  seriesItemsForGame,
  editingItem,
  sources,
}) {
  return (
    <>
      <SectionHeader icon="fa-tag" title="Titles & Naming" />
      <GameLineageFields
        f={cgmf}
        u={ugm}
        allFranchises={allFranchises}
        seriesItemsForGame={seriesItemsForGame}
        franchiseCollections={franchiseCollections}
      />
      <GameFormBody
        f={cgmf}
        u={ugm}
        allGames={allGames}
        excludeGameId={editingItem?.system_id}
        sources={sources}
        ownerId={editingItem?.system_id}
      />
      <SectionHeader icon="fa-book-open" title="Structured Notes" />
      {/* `remark` is hidden here: the form's Remark field edits the same
          singleton note row, and two editors for one row overwrite each
          other on Save Changes. */}
      <GameNotes
        game={editingItem ?? {}}
        isAdmin={true}
        hideSections={["remark"]}
      />
    </>
  );
}
