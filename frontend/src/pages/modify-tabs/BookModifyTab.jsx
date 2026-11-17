// Frontend: modify tab page file for BookModifyTab.
//
// BookAddTab exports the book's form body and lineage pickers, so the two
// tabs share one definition and cannot drift (the Game pattern). Modify adds
// the entry's Structured Notes below the form; the franchise ribbon is
// Modify.jsx's, above the editor card.
import { SectionHeader } from "../../components/forms/FormField";
import { BookFormBody, BookLineageFields } from "../add-tabs/BookAddTab";
import BookNotes from "../detail/BookNotes";

export default function BookModifyTab({
  franchiseCollections,
  cnvf,
  unv,
  allFranchises,
  seriesItemsForBook,
  editingItem,
  sources,
}) {
  return (
    <>
      <SectionHeader icon="fa-tag" title="Titles & Naming" />
      <BookLineageFields
        f={cnvf}
        u={unv}
        allFranchises={allFranchises}
        seriesItemsForBook={seriesItemsForBook}
        franchiseCollections={franchiseCollections}
      />
      <BookFormBody
        f={cnvf}
        u={unv}
        sources={sources}
        ownerId={editingItem?.system_id}
      />
      <SectionHeader icon="fa-book-open" title="Structured Notes" />
      <BookNotes
        book={editingItem ?? {}}
      />
    </>
  );
}
