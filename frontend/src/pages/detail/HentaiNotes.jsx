// Frontend: page component file for HentaiNotes.
//
// The notes page for one hentai. The type has no section of its own - only
// the ones every entry has (remark, comments, ...) - so this is the plain
// wrapper every such type has, as MovieNotes is.
import NotesTemplate from "../notes/NotesTemplate";

export default function HentaiNotes({ hentai, isAdmin, hideSections }) {
  return (
    <NotesTemplate
      ownerType="hentai"
      ownerId={hentai.system_id}
      isAdmin={isAdmin}
      hideSections={hideSections}
    />
  );
}
