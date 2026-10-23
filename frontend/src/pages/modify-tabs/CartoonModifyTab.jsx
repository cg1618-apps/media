// Frontend: modify tab page file for CartoonModifyTab.
//
// CartoonAddTab exports the cartoon form body and lineage pickers, so the two
// tabs share one definition and cannot drift. Modify passes the cartoon's id
// as `ownerId` and adds the entry's Structured Notes below the form; the
// franchise ribbon above the card is Modify.jsx's.
import { SectionHeader } from "../../components/forms/FormField";
import { CartoonFormBody, CartoonLineageFields } from "../add-tabs/CartoonAddTab";
import CartoonNotes from "../detail/CartoonNotes";

export default function CartoonModifyTab({
  franchiseCollections,
  cmf,
  uc,
  allFranchises,
  seriesItemsForCartoon,
  editingItem,
  sources,
}) {
  return (
    <>
      <SectionHeader icon="fa-tag" title="Titles & Naming" />
      <CartoonLineageFields
        f={cmf}
        u={uc}
        allFranchises={allFranchises}
        seriesItemsForCartoon={seriesItemsForCartoon}
        franchiseCollections={franchiseCollections}
      />
      <CartoonFormBody f={cmf} u={uc} sources={sources} ownerId={editingItem?.system_id} />

      <SectionHeader icon="fa-book-open" title="Structured Notes" />
      {/* `remark` is hidden here: the form's Remark field edits the same
          singleton note row, and two editors for one row overwrite each
          other on Save Changes. */}
      <CartoonNotes
        key={editingItem?.system_id}
        cartoon={editingItem ?? {}}
        isAdmin={true}
        hideSections={["remark"]}
      />
    </>
  );
}
