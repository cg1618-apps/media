// Frontend: an entity's notes on its Modify editor - studio, publisher,
// person, character and identity.
//
// The same block the entity's detail page draws (NotesTemplate, owner type
// the entity's): its 備註 Remark list, its 個人筆記 Personal Notes and its 資源
// Resources, under the "Structured Notes" header the media editors use. Each
// row saves on its own, so the block is rendered OUTSIDE the editor's
// <form>: its buttons and inputs must never submit the record, and its own
// small forms must not nest inside the editor's. Keyed on the owner, so
// moving to another record never shows the last one's rows. Add has no
// counterpart: a record that does not exist yet has no notes.
import NotesTemplate from "../../pages/notes/NotesTemplate";
import { SectionHeader } from "./FormField";

export default function EntityModifyNotes({ ownerType, ownerId }) {
  if (!ownerId) return null;
  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6">
      <SectionHeader icon="fa-book-open" title="Structured Notes" />
      <NotesTemplate key={ownerId} ownerType={ownerType} ownerId={ownerId} />
    </div>
  );
}
