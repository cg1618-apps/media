// Frontend: modify tab page file for HGameModifyTab.
//
// Renders HGameAddTab's lineage pickers and field body, so the Add and Modify
// forms of the type are one definition. Modify adds the ribbon above the
// form and the entry's Structured Notes below it.
import { SectionHeader } from "../../components/forms/FormField";
import HGameNotes from "../detail/HGameNotes";
import { HGameFormBody, HGameLineageFields } from "../add-tabs/HGameAddTab";

export default function HGameModifyTab({
  franchiseCollections,
  chgf,
  uhg,
  allFranchises,
  allHGames,
  seriesItemsForHGame,
  editingItem,
  sources,
}) {
  return (
    <>
      <SectionHeader icon="fa-gamepad" title="Titles & Naming" />
      <HGameLineageFields
        f={chgf}
        u={uhg}
        allFranchises={allFranchises}
        seriesItemsForHGame={seriesItemsForHGame}
        franchiseCollections={franchiseCollections}
      />
      <HGameFormBody
        f={chgf}
        u={uhg}
        allHGames={allHGames}
        excludeId={editingItem?.system_id}
        sources={sources}
        ownerId={editingItem?.system_id}
      />
      <SectionHeader icon="fa-book-open" title="Structured Notes" />
      {/* `remark` is hidden here: the form's Remark field edits the same
          singleton note row, and two editors for one row overwrite each
          other on Save Changes. */}
      <HGameNotes
        hGame={editingItem ?? {}}
        isAdmin={true}
        hideSections={["remark"]}
      />
    </>
  );
}
