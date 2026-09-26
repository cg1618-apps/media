// Frontend: modify tab page file for GameModifyTab.
//
// The comic pair keeps two near-identical copies of the same fields; this one
// does not. GameAddTab exports its field body and lineage pickers, so the two
// tabs share one definition and cannot drift — Modify adds the ribbon section
// above the form and the entry's Structured Notes below it.
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
      <SectionHeader icon="fa-gamepad" title="Titles & Naming" />
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
