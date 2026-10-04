// Frontend: page component file for ComicNotes.
import NotesTemplate from "../notes/NotesTemplate";

export default function ComicNotes({ comic, isAdmin, hideSections, series, franchise }) {
  return (
    <NotesTemplate
      ownerType="comic"
      ownerId={comic.system_id}
      isAdmin={isAdmin}
      hideSections={hideSections}
      series={series}
      franchise={franchise}
    />
  );
}
