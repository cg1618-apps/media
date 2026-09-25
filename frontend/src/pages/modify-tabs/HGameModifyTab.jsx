// Frontend: modify tab page file for HGameModifyTab.
//
// Renders HGameAddTab's lineage pickers and field body, so the Add and Modify
// forms of the type are one definition. The only difference is the ribbon
// Modify renders above the form.
import { SectionHeader } from "../../components/forms/FormField";
import { HGameFormBody, HGameLineageFields } from "../add-tabs/HGameAddTab";

export default function HGameModifyTab({
  franchiseCollections,
  chgf,
  uhg,
  allFranchises,
  allHGames,
  seriesItemsForHGame,
  editingItem,
  ribbonSection,
  sources,
}) {
  return (
    <>
      {ribbonSection}

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
    </>
  );
}
